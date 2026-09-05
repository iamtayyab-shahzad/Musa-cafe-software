/** Production sync engine for POS offline queue. */

import {
  cacheGet,
  cacheSet,
  enqueueAction,
  listDeadActions,
  listPendingActions,
  mapLocalToServerId,
  markActionError,
  markActionSynced,
  mergeInventory,
  mergeOrders,
  pruneSyncedActions,
  replaceInventory,
  replaceOrdersPreservingUnsynced,
  resolveServerOrderId,
  upsertLocalOrder,
  listLocalOrders,
  deleteLocalOrder,
  pruneCacheKeys,
  reviveDeadAction,
} from "@/lib/offline-db";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  bindConnectivityListeners,
  beginExtendedSyncTimeout,
  clearForcedOffline,
  endExtendedSyncTimeout,
  forceOfflineNow,
  isBrowserOnline,
  isNetworkError,
  isOnline,
  isPermanentSyncError,
  isQueueableError,
  shouldCountSyncAttempt,
  POS_CONNECTIVITY_EVENT,
} from "@/lib/network";
import { notifyOrdersChanged } from "@/lib/offline-events";
import {
  buildInventoryPullUrl,
  buildOrdersPullUrl,
  CATALOG_PULL_AT_KEY,
  shouldUseIncrementalCatalogPull,
} from "@/lib/sync-pull";
import type {
  CreateOrderInput,
  InventoryItem,
  OfflineAction,
  Order,
  SyncConflict,
  SyncStatus,
} from "@/types";

const SYNC_META_KEY = "sync_meta";
const CONFLICTS_KEY = "sync_conflicts";
const MAX_ATTEMPTS = 8;
export const POS_SYNC_COMPLETE_EVENT = "pos-sync-complete";

type SyncMeta = {
  last_sync_at: string | null;
  last_error: string | null;
};

export type SyncEngineState = SyncStatus & {
  online: boolean;
  last_sync_at: string | null;
  last_error: string | null;
  conflicts: SyncConflict[];
  dead_count: number;
};

type Listener = (state: SyncEngineState) => void;

const DEFAULT_STATE: SyncEngineState = {
  online: true,
  syncing: false,
  pending_count: 0,
  completed: 0,
  total: 0,
  current_action: null,
  last_sync_at: null,
  last_error: null,
  conflicts: [],
  dead_count: 0,
};

let state: SyncEngineState = { ...DEFAULT_STATE };
const listeners = new Set<Listener>();
let syncPromise: Promise<void> | null = null;
let backoffMs = 500;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let drainTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

/** Push remaining due queue items without waiting for the slow interval. */
function scheduleDrainSoon() {
  if (!isBrowserOnline()) return;
  if (drainTimer) clearTimeout(drainTimer);
  drainTimer = setTimeout(() => {
    drainTimer = null;
    if (!isBrowserOnline()) return;
    void runSync("drain");
  }, 50);
}

function emit() {
  for (const l of listeners) l(state);
}

function setState(patch: Partial<SyncEngineState>) {
  state = { ...state, ...patch };
  emit();
}

function notifyClients() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(POS_SYNC_COMPLETE_EVENT));
  }
}

async function loadMeta() {
  const meta = await cacheGet<SyncMeta>(SYNC_META_KEY);
  const conflicts = (await cacheGet<SyncConflict[]>(CONFLICTS_KEY)) || [];
  setState({
    last_sync_at: meta?.last_sync_at ?? null,
    last_error: meta?.last_error ?? null,
    conflicts,
  });
}

async function saveMeta(patch: Partial<SyncMeta>) {
  const prev = (await cacheGet<SyncMeta>(SYNC_META_KEY)) || {
    last_sync_at: null,
    last_error: null,
  };
  const next = { ...prev, ...patch };
  await cacheSet(SYNC_META_KEY, next);
  setState({
    last_sync_at: next.last_sync_at,
    last_error: next.last_error,
  });
}

export async function logConflict(
  conflict: Omit<SyncConflict, "id" | "created_at">,
) {
  const entry: SyncConflict = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    ...conflict,
  };
  const prev = (await cacheGet<SyncConflict[]>(CONFLICTS_KEY)) || [];
  const next = [entry, ...prev].slice(0, 100);
  await cacheSet(CONFLICTS_KEY, next);
  setState({ conflicts: next });
  return entry;
}

/** Clear the conflict log only (does not touch the order queue). */
export async function clearSyncConflicts() {
  await cacheSet(CONFLICTS_KEY, []);
  setState({ conflicts: [] });
}

const OBSOLETE_ORDER_SYNC_ERROR =
  /only pending orders can be edited|order already processed|already completed|already cancelled|no fields to update/i;

function isObsoleteOrderUpdateError(err: unknown) {
  if (!(err instanceof ApiError)) return false;
  if (err.status === 409) return true;
  return OBSOLETE_ORDER_SYNC_ERROR.test(err.message || "");
}

/**
 * Drop queue items that cannot (and must not) change the server anymore.
 * Safe: only clears CREATE when local→server id is already known, UPDATE when
 * the order is already COMPLETED/CANCELLED locally *and* not mid-edit
 * (pending_sync), and duplicate CREATEs. Real unsynced sales/edits are kept.
 */
export async function clearObsoleteOrderQueue(): Promise<number> {
  const [pending, dead, locals] = await Promise.all([
    listPendingActions(),
    listDeadActions(),
    listLocalOrders(),
  ]);
  const idMap =
    (await cacheGet<Record<string, string>>("order_id_map")) || {};
  let cleared = 0;

  const localByKey = new Map<string, Order>();
  for (const o of locals) {
    localByKey.set(o.id, o);
    if (o.client_order_id) localByKey.set(o.client_order_id, o);
  }

  const markClear = async (id: string) => {
    await markActionSynced(id);
    cleared += 1;
  };

  // Duplicate CREATE_ORDER for the same ticket → keep oldest only.
  const createsByTicket = new Map<string, OfflineAction[]>();
  for (const action of [...pending, ...dead]) {
    if (action.type !== "CREATE_ORDER") continue;
    const p = action.payload as {
      localId?: string;
      input?: { client_order_id?: string };
    };
    const key = p.input?.client_order_id || p.localId;
    if (!key) continue;
    const list = createsByTicket.get(key) || [];
    list.push(action);
    createsByTicket.set(key, list);
  }
  for (const list of createsByTicket.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const dup of list.slice(1)) {
      await markClear(dup.id);
    }
  }

  for (const action of [...pending, ...dead]) {
    if (action.type === "CREATE_ORDER") {
      const p = action.payload as {
        localId?: string;
        input?: { client_order_id?: string };
      };
      const localId = p.localId;
      const clientId = p.input?.client_order_id || localId;
      if (localId && idMap[localId]) {
        await markClear(action.id);
        continue;
      }
      if (clientId && idMap[clientId]) {
        await markClear(action.id);
        continue;
      }
      const local =
        (localId && localByKey.get(localId)) ||
        (clientId ? localByKey.get(clientId) : undefined);
      // Local row already remapped to a server UUID and marked synced.
      if (
        local &&
        local.sync_status === "synced" &&
        localId &&
        local.id !== localId &&
        !String(local.id).startsWith("LOCAL-")
      ) {
        await markClear(action.id);
        continue;
      }
      if (
        action.dead &&
        action.error &&
        OBSOLETE_ORDER_SYNC_ERROR.test(action.error)
      ) {
        await markClear(action.id);
      }
      continue;
    }

    if (action.type === "UPDATE_ORDER") {
      const id = (action.payload as { id?: string }).id;
      if (!id) continue;
      const serverId = idMap[id] || id;
      const local =
        localByKey.get(id) ||
        localByKey.get(serverId) ||
        locals.find(
          (o) =>
            o.id === id ||
            o.id === serverId ||
            o.client_order_id === id ||
            o.client_order_id === serverId,
        );
      if (
        local &&
        (local.order_status === "COMPLETED" ||
          local.order_status === "CANCELLED") &&
        local.sync_status !== "pending_sync" &&
        local.sync_status !== "sync_failed"
      ) {
        await markClear(action.id);
        continue;
      }
      if (
        action.dead &&
        action.error &&
        OBSOLETE_ORDER_SYNC_ERROR.test(action.error)
      ) {
        await markClear(action.id);
      }
      continue;
    }

    if (
      (action.type === "COMPLETE_ORDER" || action.type === "CANCEL_ORDER") &&
      action.dead &&
      action.error &&
      OBSOLETE_ORDER_SYNC_ERROR.test(action.error)
    ) {
      await markClear(action.id);
    }
  }

  await refreshPendingCount();
  return cleared;
}

export async function refreshPendingCount() {
  const [pending, dead] = await Promise.all([
    listPendingActions(),
    listDeadActions(),
  ]);
  setState({ pending_count: pending.length, dead_count: dead.length });
  return pending.length;
}

function scheduleRetry(delay = backoffMs) {
  // Don't schedule retries when the browser itself is offline.
  if (!isBrowserOnline()) return;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    if (!isBrowserOnline()) return;
    void runSync("retry");
  }, delay);
}

function bumpBackoff() {
  backoffMs = Math.min(backoffMs * 2, 60_000);
}

function resetBackoff() {
  backoffMs = 500;
}

async function resolveOrderId(id: string) {
  return resolveServerOrderId(id);
}

/** CREATE before COMPLETE/CANCEL so follow-ups rarely skip in the same pass. */
function syncActionPriority(type: string): number {
  if (type === "CREATE_ORDER") return 0;
  if (type === "UPDATE_ORDER") return 1;
  if (type === "COMPLETE_ORDER" || type === "CANCEL_ORDER") return 2;
  return 3;
}

async function processAction(
  action: OfflineAction,
): Promise<"ok" | "retry" | "skip" | "dead"> {
  if (!action || typeof action.type !== "string") return "dead";
  if (action.payload == null || typeof action.payload !== "object") {
    return "dead";
  }
  switch (action.type) {
    case "CREATE_ORDER": {
      const p = action.payload as {
        input: CreateOrderInput;
        orderType: "walkin" | "phone" | "website";
        localId?: string;
      };
      if (!p.input || typeof p.input !== "object") return "dead";
      // Already created earlier (id map) — do not POST again; drain follow-ups.
      if (p.localId) {
        const mapped = await resolveOrderId(p.localId);
        if (mapped && mapped !== p.localId && !mapped.startsWith("LOCAL-")) {
          const followUps = (await listPendingActions()).filter((follow) => {
            if (follow.id === action.id) return false;
            const fid = (follow.payload as { id?: string })?.id;
            return fid === p.localId;
          });
          for (const follow of followUps) {
            if (follow.type === "COMPLETE_ORDER") {
              try {
                await apiFetch(`/orders/${mapped}/complete`, {
                  method: "PATCH",
                });
              } catch (err) {
                if (!isObsoleteOrderUpdateError(err)) throw err;
              }
              await markActionSynced(follow.id);
            }
            if (follow.type === "CANCEL_ORDER") {
              try {
                await apiFetch(`/orders/${mapped}/cancel`, { method: "PATCH" });
              } catch (err) {
                if (!isObsoleteOrderUpdateError(err)) throw err;
              }
              await markActionSynced(follow.id);
            }
            if (follow.type === "UPDATE_ORDER") {
              const updates = (
                follow.payload as { updates: Record<string, unknown> }
              ).updates;
              try {
                await apiFetch(`/orders/${mapped}`, {
                  method: "PUT",
                  body: JSON.stringify(updates),
                });
              } catch (err) {
                if (!isObsoleteOrderUpdateError(err)) throw err;
              }
              await markActionSynced(follow.id);
            }
          }
          notifyOrdersChanged();
          return "ok";
        }
      }
      const path =
        p.orderType === "phone"
          ? "/orders/phone"
          : p.orderType === "walkin"
            ? "/orders/walkin"
            : "/orders";
      const order = await apiFetch<Order>(path, {
        method: "POST",
        body: JSON.stringify(p.input),
      });

      // Never flash server PENDING over a locally completed/cancelled order.
      // Staff may have already pressed Complete before CREATE finished syncing.
      const localExisting = p.localId
        ? (await listLocalOrders()).find((o) => o.id === p.localId)
        : undefined;
      const followUps = p.localId
        ? (await listPendingActions()).filter((follow) => {
            if (follow.id === action.id) return false;
            const fid = (follow.payload as { id?: string })?.id;
            return fid === p.localId;
          })
        : [];
      const willComplete =
        followUps.some((f) => f.type === "COMPLETE_ORDER") ||
        localExisting?.order_status === "COMPLETED";
      const willCancel =
        followUps.some((f) => f.type === "CANCEL_ORDER") ||
        localExisting?.order_status === "CANCELLED";

      let orderStatus = order.order_status;
      if (willComplete) orderStatus = "COMPLETED";
      else if (willCancel) orderStatus = "CANCELLED";

      const { preferEarlierCreatedAt } = await import("@/lib/order-identity");
      const syncedOrder: Order = {
        ...order,
        client_order_id:
          order.client_order_id ||
          p.input.client_order_id ||
          p.localId ||
          order.id,
        created_at: preferEarlierCreatedAt(
          localExisting?.created_at,
          preferEarlierCreatedAt(p.input.created_at, order.created_at),
        ),
        // Prefer server daily token; fall back to local offline assignment.
        business_date:
          order.business_date ||
          localExisting?.business_date ||
          p.input.business_date,
        daily_number:
          order.daily_number ||
          localExisting?.daily_number ||
          p.input.daily_number,
        order_status: orderStatus,
        // Keep pending_sync until follow-up COMPLETE/CANCEL PATCH succeeds.
        sync_status:
          willComplete || willCancel
            ? ("pending_sync" as const)
            : ("synced" as const),
      };
      await upsertLocalOrder(syncedOrder);
      if (syncedOrder.business_date && syncedOrder.daily_number) {
        const { noteServerDailyNumber } = await import(
          "@/lib/daily-order-number"
        );
        await noteServerDailyNumber(
          syncedOrder.business_date,
          syncedOrder.daily_number,
        );
      }

      if (p.localId) {
        await mapLocalToServerId(p.localId, order.id);
        // Purge every local twin for this ticket (client UUID / LOCAL-* row).
        const locals = await listLocalOrders();
        for (const row of locals) {
          if (row.id === syncedOrder.id) continue;
          if (
            row.id === p.localId ||
            row.client_order_id === p.localId ||
            row.client_order_id === syncedOrder.client_order_id
          ) {
            await deleteLocalOrder(row.id);
          }
        }
        for (const follow of followUps) {
          if (follow.type === "COMPLETE_ORDER") {
            try {
              await apiFetch(`/orders/${order.id}/complete`, { method: "PATCH" });
            } catch (err) {
              if (
                !(
                  err instanceof ApiError &&
                  (err.status === 409 ||
                    /already|completed|not pending/i.test(err.message))
                )
              ) {
                throw err;
              }
            }
            await markActionSynced(follow.id);
            await upsertLocalOrder({
              ...syncedOrder,
              order_status: "COMPLETED",
              sync_status: "synced",
              updated_at: new Date().toISOString(),
            });
          }
          if (follow.type === "CANCEL_ORDER") {
            try {
              await apiFetch(`/orders/${order.id}/cancel`, { method: "PATCH" });
            } catch (err) {
              if (
                !(
                  err instanceof ApiError &&
                  (err.status === 409 ||
                    /already|cancelled|not pending/i.test(err.message))
                )
              ) {
                throw err;
              }
            }
            await markActionSynced(follow.id);
            await upsertLocalOrder({
              ...syncedOrder,
              order_status: "CANCELLED",
              sync_status: "synced",
              updated_at: new Date().toISOString(),
            });
          }
          if (follow.type === "UPDATE_ORDER") {
            const updates = (follow.payload as { updates: Record<string, unknown> })
              .updates;
            try {
              await apiFetch(`/orders/${order.id}`, {
                method: "PUT",
                body: JSON.stringify(updates),
              });
            } catch (err) {
              // Order may already be completed — edit is obsolete.
              if (!isObsoleteOrderUpdateError(err)) throw err;
            }
            await markActionSynced(follow.id);
          }
        }
      }
      notifyOrdersChanged();
      return "ok";
    }
    case "COMPLETE_ORDER": {
      const localId = (action.payload as { id: string }).id;
      const pendingCreates = await listPendingActions();
      const waitingCreate = pendingCreates.some(
        (a) =>
          a.type === "CREATE_ORDER" &&
          (a.payload as { localId?: string }).localId === localId,
      );
      if (waitingCreate) return "skip";
      // Dead CREATE must be revived before COMPLETE — otherwise we PATCH a
      // client UUID that never existed on the server (permanent 404).
      const deadCreates = await listDeadActions();
      const deadCreate = deadCreates.find(
        (a) =>
          a.type === "CREATE_ORDER" &&
          (a.payload as { localId?: string }).localId === localId,
      );
      if (deadCreate) {
        await reviveDeadAction(deadCreate.id);
        return "skip";
      }
      const serverId = await resolveOrderId(localId);
      try {
        await apiFetch(`/orders/${serverId}/complete`, { method: "PATCH" });
      } catch (err) {
        if (isQueueableError(err)) throw err;
        if (
          !(
            err instanceof ApiError &&
            (err.status === 409 ||
              /already|completed|not pending/i.test(err.message))
          )
        ) {
          throw err;
        }
      }
      {
        const locals = await listLocalOrders();
        const local =
          locals.find((o) => o.id === serverId) ||
          locals.find((o) => o.id === localId);
        if (local) {
          await upsertLocalOrder({
            ...local,
            id: serverId,
            order_status: "COMPLETED",
            sync_status: "synced",
            updated_at: new Date().toISOString(),
          });
          if (localId !== serverId) await deleteLocalOrder(localId);
        }
      }
      notifyOrdersChanged();
      return "ok";
    }
    case "CANCEL_ORDER": {
      const localId = (action.payload as { id: string }).id;
      const waitingCreate = (await listPendingActions()).some(
        (a) =>
          a.type === "CREATE_ORDER" &&
          (a.payload as { localId?: string }).localId === localId,
      );
      if (waitingCreate) return "skip";
      const deadCreate = (await listDeadActions()).find(
        (a) =>
          a.type === "CREATE_ORDER" &&
          (a.payload as { localId?: string }).localId === localId,
      );
      if (deadCreate) {
        await reviveDeadAction(deadCreate.id);
        return "skip";
      }
      const serverId = await resolveOrderId(localId);
      try {
        await apiFetch(`/orders/${serverId}/cancel`, { method: "PATCH" });
      } catch (err) {
        if (isQueueableError(err)) throw err;
        const msg = err instanceof ApiError ? err.message || "" : "";
        // Idempotent void only — never drop a failed completed-order cancel.
        if (
          !(
            err instanceof ApiError &&
            (err.status === 404 ||
              (err.status === 409 && /already cancelled/i.test(msg)))
          )
        ) {
          throw err;
        }
      }
      {
        const locals = await listLocalOrders();
        const local =
          locals.find((o) => o.id === serverId) ||
          locals.find((o) => o.id === localId);
        if (local) {
          await upsertLocalOrder({
            ...local,
            id: serverId,
            order_status: "CANCELLED",
            sync_status: "synced",
            updated_at: new Date().toISOString(),
          });
          if (localId !== serverId) await deleteLocalOrder(localId);
        }
      }
      notifyOrdersChanged();
      return "ok";
    }
    case "CREATE_PRODUCT": {
      const p = action.payload as {
        id?: string;
        product?: Record<string, unknown>;
        sizes?: { id?: string; size: string; price: number }[];
      } & Record<string, unknown>;
      const raw = { ...(p.product || p) } as Record<string, unknown>;
      delete raw.sizes;
      delete raw.product;
      delete raw.updates;
      const productId = String(raw.id || p.id || "");
      await apiFetch("/products", {
        method: "POST",
        body: JSON.stringify(raw),
      });
      for (const s of p.sizes || []) {
        await apiFetch("/product-sizes", {
          method: "POST",
          body: JSON.stringify({
            id: s.id,
            product_id: productId,
            size: s.size,
            price: s.price,
          }),
        });
      }
      return "ok";
    }
    case "UPDATE_PRODUCT": {
      const p = action.payload as {
        id: string;
        product?: Record<string, unknown>;
        sizes?: { id?: string; size: string; price: number }[];
        updates?: Record<string, unknown>;
      };
      const body = { ...(p.product || p.updates || {}) } as Record<
        string,
        unknown
      >;
      delete body.sizes;
      delete body.product;
      delete body.updates;
      delete body.id;
      await apiFetch(`/products/${p.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (p.sizes) {
        const allSizes = await apiFetch<
          { id: string; product_id: string; size: string; price: number }[]
        >("/product-sizes");
        const existing = allSizes.filter((s) => s.product_id === p.id);
        const desired = new Set(p.sizes.map((s) => s.size.toLowerCase()));
        for (const e of existing) {
          if (!desired.has(e.size.toLowerCase())) {
            try {
              await apiFetch(`/product-sizes/${e.id}`, { method: "DELETE" });
            } catch {
              // Size may be referenced by old orders — leave it, sync the rest.
            }
          }
        }
        for (const s of p.sizes) {
          const match = existing.find(
            (e) => e.size.toLowerCase() === s.size.toLowerCase(),
          );
          if (match) {
            await apiFetch(`/product-sizes/${match.id}`, {
              method: "PUT",
              body: JSON.stringify({ size: s.size, price: s.price }),
            });
          } else {
            await apiFetch("/product-sizes", {
              method: "POST",
              body: JSON.stringify({
                id: s.id,
                product_id: p.id,
                size: s.size,
                price: s.price,
              }),
            });
          }
        }
      }
      return "ok";
    }
    case "CREATE_PRODUCT_SIZE":
      await apiFetch("/product-sizes", {
        method: "POST",
        body: JSON.stringify(action.payload),
      });
      return "ok";
    case "UPDATE_PRODUCT_SIZE": {
      const p = action.payload as { id: string; updates: Record<string, unknown> };
      await apiFetch(`/product-sizes/${p.id}`, {
        method: "PUT",
        body: JSON.stringify(p.updates),
      });
      return "ok";
    }
    case "DELETE_PRODUCT_SIZE": {
      const id = (action.payload as { id: string }).id;
      await apiFetch(`/product-sizes/${id}`, { method: "DELETE" });
      return "ok";
    }
    case "CREATE_CATEGORY":
      await apiFetch("/categories", {
        method: "POST",
        body: JSON.stringify(action.payload),
      });
      return "ok";
    case "UPDATE_CATEGORY": {
      const p = action.payload as { id: string; updates: Record<string, unknown> };
      await apiFetch(`/categories/${p.id}`, {
        method: "PUT",
        body: JSON.stringify(p.updates),
      });
      return "ok";
    }
    case "CREATE_INVENTORY": {
      await apiFetch("/inventory", {
        method: "POST",
        body: JSON.stringify(action.payload),
      });
      return "ok";
    }
    case "UPDATE_INVENTORY": {
      const p = action.payload as {
        id: string;
        updates: Record<string, unknown>;
        expected_stock?: number;
      };
      let serverItem: InventoryItem | null = null;
      try {
        const all = await apiFetch<InventoryItem[]>("/inventory");
        serverItem = all.find((i) => i.id === p.id) || null;
        await replaceInventory(all);
      } catch {
        /* proceed */
      }
      if (
        serverItem &&
        typeof p.expected_stock === "number" &&
        serverItem.stock !== p.expected_stock
      ) {
        await logConflict({
          entity: "inventory",
          entity_id: p.id,
          message: `Stock conflict for ${serverItem.name}: local expected ${p.expected_stock}, server has ${serverItem.stock}. Server kept; non-stock fields applied.`,
          local: p.updates,
          server: serverItem,
        });
        const { stock: _ignoredStock, ...safe } = p.updates;
        void _ignoredStock;
        if (Object.keys(safe).length) {
          await apiFetch(`/inventory/${p.id}`, {
            method: "PUT",
            body: JSON.stringify(safe),
          });
        }
        return "ok";
      }
      await apiFetch(`/inventory/${p.id}`, {
        method: "PUT",
        body: JSON.stringify(p.updates),
      });
      return "ok";
    }
    case "UPDATE_SETTINGS":
      await apiFetch("/settings", {
        method: "PUT",
        body: JSON.stringify(action.payload),
      });
      return "ok";
    case "CREATE_OFFER":
      await apiFetch("/offers", {
        method: "POST",
        body: JSON.stringify(action.payload),
      });
      return "ok";
    case "UPDATE_OFFER": {
      const p = action.payload as { id: string; updates: Record<string, unknown> };
      await apiFetch(`/offers/${p.id}`, {
        method: "PUT",
        body: JSON.stringify(p.updates),
      });
      return "ok";
    }
    case "UPDATE_ORDER": {
      const p = action.payload as { id: string; updates: Record<string, unknown> };
      const waiting = (await listPendingActions()).find(
        (a) =>
          a.type === "CREATE_ORDER" &&
          (a.payload as { localId?: string }).localId === p.id,
      );
      if (waiting) return "skip";
      const serverId = await resolveOrderId(p.id);
      const markLocalSynced = async () => {
        const locals = await listLocalOrders();
        const local =
          locals.find((o) => o.id === serverId) ||
          locals.find((o) => o.id === p.id) ||
          locals.find((o) => o.client_order_id === p.id);
        if (local) {
          await upsertLocalOrder({
            ...local,
            sync_status: "synced",
            updated_at: new Date().toISOString(),
          });
        }
      };
      try {
        await apiFetch(`/orders/${serverId}`, {
          method: "PUT",
          body: JSON.stringify(p.updates),
        });
      } catch (err) {
        // Completed/cancelled tickets cannot be edited — drop the stale update
        // and clear pending_sync so the next pull can restore server truth.
        if (isObsoleteOrderUpdateError(err)) {
          await markLocalSynced();
          notifyOrdersChanged();
          return "ok";
        }
        throw err;
      }
      // Keep local edited lines/totals; only clear the pending_sync flag.
      await markLocalSynced();
      notifyOrdersChanged();
      return "ok";
    }
    default:
      return "ok";
  }
}

const PERMANENT_DEAD_ERROR =
  /invalid product|unavailable|cart cannot be empty|customer name is required|invalid phone|invalid location/i;

async function reviveDeadActionsOnReconnect() {
  const dead = await listDeadActions();
  for (const action of dead) {
    if (action.error && PERMANENT_DEAD_ERROR.test(action.error)) continue;
    // Do not revive edits/completes that can never succeed again.
    if (action.error && OBSOLETE_ORDER_SYNC_ERROR.test(action.error)) {
      await markActionSynced(action.id);
      continue;
    }
    await reviveDeadAction(action.id);
  }
}

export async function runSync(reason: string = "manual"): Promise<void> {
  // User-facing online badge follows the browser — not the API cooldown.
  if (!isBrowserOnline()) {
    setState({ online: false });
    await refreshPendingCount();
    return;
  }
  setState({ online: true });

  const catchUp =
    reason === "manual" ||
    reason === "online" ||
    reason === "startup" ||
    reason === "visible" ||
    reason === "drain" ||
    reason === "retry" ||
    reason === "enqueue";

  // Cooldown from one slow request must not block catch-up of a full backlog.
  if (!isOnline()) {
    if (catchUp) {
      clearForcedOffline();
    } else {
      await refreshPendingCount();
      return;
    }
  }
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    if (catchUp) {
      beginExtendedSyncTimeout();
    }
    setState({ online: true, syncing: true, completed: 0, current_action: null });
    try {
      if (reason === "online" || reason === "startup" || reason === "manual" || reason === "visible") {
        await reviveDeadActionsOnReconnect();
      }
      // Drop stale CREATE/UPDATE items before hammering the API.
      try {
        await clearObsoleteOrderQueue();
      } catch {
        /* ignore prune failures */
      }
      const pending = await listPendingActions();
      const now = Date.now();
      const due = pending
        .filter((a) => {
          if (!a.next_retry_at) return true;
          return new Date(a.next_retry_at).getTime() <= now;
        })
        .slice()
        .sort((a, b) => syncActionPriority(a.type) - syncActionPriority(b.type));
      setState({ total: due.length, pending_count: pending.length });

      let hadFailure = false;
      let lastError: string | null = null;
      const skipped: OfflineAction[] = [];

      const runOne = async (action: OfflineAction, collectSkips: boolean) => {
        if (!isBrowserOnline()) {
          hadFailure = true;
          lastError = "Browser offline";
          return;
        }
        const stillOpen = (await listPendingActions()).some(
          (a) => a.id === action.id,
        );
        if (!stillOpen) return;

        setState({ current_action: action.type });
        try {
          const result = await processAction(action);
          if (result === "ok") {
            await markActionSynced(action.id);
            setState({ completed: state.completed + 1 });
          } else if (result === "dead") {
            await markActionError(action.id, "Malformed sync payload", {
              dead: true,
            });
          } else if (result === "skip" && collectSkips) {
            skipped.push(action);
          }
        } catch (err) {
          hadFailure = true;
          const message =
            err instanceof Error ? err.message : "Sync failed";
          lastError = message;
          const countAttempt = shouldCountSyncAttempt(err);
          const attempts = countAttempt
            ? (action.attempts || 0) + 1
            : action.attempts || 0;
          const permanent =
            isPermanentSyncError(err) ||
            (countAttempt && attempts >= MAX_ATTEMPTS);

          if (permanent) {
            await markActionError(action.id, message, {
              attempts,
              dead: true,
            });
            await logConflict({
              entity: "sync_queue",
              entity_id: action.id,
              message: `Dead-letter after ${attempts} attempts: ${action.type} — ${message}`,
              local: action.payload,
            });
            return;
          }

          const delay = Math.min(1000 * 2 ** Math.min(attempts || 1, 6), 60_000);
          await markActionError(action.id, message, {
            attempts,
            next_retry_at: new Date(Date.now() + delay).toISOString(),
          });
          if (isNetworkError(err) || isQueueableError(err)) {
            bumpBackoff();
            // Do NOT abort the rest of the batch — one cold timeout must not
            // kill CREATE/COMPLETE for the remaining queued tickets.
            return;
          }
        }
      };

      for (const action of due) {
        if (!isBrowserOnline()) break;
        await runOne(action, true);
      }
      // Second pass: COMPLETE/CANCEL that waited on CREATE in this same run.
      for (const action of skipped) {
        if (!isBrowserOnline()) break;
        await runOne(action, false);
      }

      await pruneSyncedActions(50);
      try {
        await pruneCacheKeys([]);
      } catch (err) {
        console.warn("[pos-sync] cache prune skipped", err);
      }

      // Keep order push fast: enqueue/drain only drain the queue. Full catalog
      // pull runs on startup, reconnect, tab focus, manual sync, or interval.
      const stillPending = await listPendingActions();
      const stillIds = new Set(stillPending.map((a) => a.id));
      const syncedSomething = due.some((a) => !stillIds.has(a.id));

      const shouldRefreshCatalog =
        reason === "manual" ||
        reason === "startup" ||
        reason === "online" ||
        reason === "visible" ||
        (reason === "interval" && (syncedSomething || due.length === 0));

      // Do not gate catalog/offers on hadFailure: one bad action in a large
      // backlog must not block discount-rules refresh when others succeeded
      // or the queue is already idle.
      const allowCatalogPull =
        reason === "manual" ||
        syncedSomething ||
        due.length === 0 ||
        stillPending.length === 0;

      if (shouldRefreshCatalog && allowCatalogPull) {
        try {
          const wantIncremental = shouldUseIncrementalCatalogPull(reason);
          const lastPull = wantIncremental
            ? await cacheGet<string>(CATALOG_PULL_AT_KEY)
            : null;
          const useSince =
            wantIncremental &&
            typeof lastPull === "string" &&
            lastPull.length > 0;
          // Stamp taken at pull start (minus 2s) so borderline updates are not missed.
          const pullStartedAt = new Date(Date.now() - 2000).toISOString();
          const ordersUrl = buildOrdersPullUrl({
            since: useSince ? lastPull : null,
          });
          const inventoryUrl = buildInventoryPullUrl({
            since: useSince ? lastPull : null,
          });

          const [orders, inventory, discountRules] = await Promise.all([
            apiFetch<Order[]>(ordersUrl),
            apiFetch<InventoryItem[]>(inventoryUrl),
            apiFetch<
              {
                id: string;
                name: string;
                active: boolean;
                percent: number;
                min_subtotal: number;
                schedule_type: string;
                start_date?: string | null;
                end_date?: string | null;
                weekdays_json?: string;
                exclude_deals?: boolean;
              }[]
            >("/discount-rules/active").catch(() => []),
          ]);
          if (Array.isArray(orders)) {
            if (useSince) {
              await mergeOrders(orders);
            } else {
              await replaceOrdersPreservingUnsynced(orders);
            }
            const { seedDailyCountersFromOrders } = await import(
              "@/lib/daily-order-number"
            );
            await seedDailyCountersFromOrders(await listLocalOrders());
          }
          if (Array.isArray(inventory)) {
            if (useSince) {
              await mergeInventory(inventory);
            } else {
              await replaceInventory(inventory);
            }
          }
          const { setDiscountRulesCache } = await import("@/lib/discount-rules");
          const { cacheSet: cacheSetLocal } = await import("@/lib/offline-db");
          if (Array.isArray(discountRules)) {
            setDiscountRulesCache(discountRules);
            await cacheSetLocal("discount_rules", discountRules);
          }
          await cacheSet(CATALOG_PULL_AT_KEY, pullStartedAt);
        } catch {
          /* ignore refresh failures — keep previous catalog_pull_at */
        }
      }

      await saveMeta({
        last_sync_at: new Date().toISOString(),
        last_error: hadFailure ? lastError : null,
      });
      if (hadFailure) {
        scheduleRetry(backoffMs);
      } else {
        resetBackoff();
      }
      notifyClients();

      // Completes enqueued while CREATE was in flight must not wait on interval.
      // Only re-drain when this pass actually moved the queue (avoids a skip loop).
      const nowMs = Date.now();
      const dueLeft = stillPending.some((a) => {
        if (!a.next_retry_at) return true;
        return new Date(a.next_retry_at).getTime() <= nowMs;
      });
      if (syncedSomething && dueLeft && isBrowserOnline() && isOnline()) {
        scheduleDrainSoon();
      }
    } finally {
      if (catchUp) {
        endExtendedSyncTimeout();
      }
      await refreshPendingCount();
      setState({
        syncing: false,
        current_action: null,
        online: isBrowserOnline(),
      });
      syncPromise = null;
    }
  })();

  return syncPromise;
}

export function getSyncState() {
  return state;
}

export function subscribeSync(listener: Listener) {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function startSyncEngine() {
  if (started || typeof window === "undefined") return;
  started = true;
  bindConnectivityListeners();
  void loadMeta().then(async () => {
    try {
      const { healIndexedDb } = await import("@/lib/offline-db");
      await healIndexedDb();
    } catch (err) {
      console.warn("[pos-storage-heal] startup scan failed", err);
    }
    await refreshPendingCount();
    try {
      const { cacheGet } = await import("@/lib/offline-db");
      const { setDiscountRulesCache } = await import("@/lib/discount-rules");
      const cached = await cacheGet<Parameters<typeof setDiscountRulesCache>[0]>(
        "discount_rules",
      );
      if (cached?.length) setDiscountRulesCache(cached);
    } catch {
      /* ignore */
    }
  });

  const onOnline = () => {
    clearForcedOffline();
    setState({ online: true });
    resetBackoff();
    void runSync("online");
  };
  const onOffline = () => {
    forceOfflineNow();
    setState({ online: false });
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (drainTimer) {
      clearTimeout(drainTimer);
      drainTimer = null;
    }
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  const onConnectivity = (e: Event) => {
    const detail = (e as CustomEvent<{ online?: boolean; forced?: boolean }>)
      .detail;
    const online = Boolean(detail?.online);
    const forced = Boolean(detail?.forced);
    // Circuit-breaker cooldown (forced=true while browser still online) must
    // not flip the Online/Offline badge during catch-up syncing.
    if (!online && forced && isBrowserOnline()) {
      return;
    }
    setState({ online: isBrowserOnline() && online });
    // API reachable again after a forced-offline cooldown — push immediately.
    if (online) {
      resetBackoff();
      void runSync("online");
    }
  };
  window.addEventListener(POS_CONNECTIVITY_EVENT, onConnectivity);

  const onVisible = () => {
    if (document.hidden) return;
    if (!isBrowserOnline()) return;
    void runSync("visible");
  };
  document.addEventListener("visibilitychange", onVisible);

  setState({ online: isBrowserOnline() });

  const interval = setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (!isBrowserOnline()) {
      setState({ online: false });
      void refreshPendingCount();
      return;
    }
    void runSync("interval");
  }, 45_000);

  if (isBrowserOnline()) void runSync("startup");

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener(POS_CONNECTIVITY_EVENT, onConnectivity);
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(interval);
    if (retryTimer) clearTimeout(retryTimer);
    if (drainTimer) clearTimeout(drainTimer);
    started = false;
  };
}

export async function enqueueAndTrack(
  action: Omit<OfflineAction, "id" | "created_at" | "synced">,
) {
  const item = await enqueueAction(action);
  await refreshPendingCount();
  if (!isOnline()) return item;
  // If CREATE is already syncing, wait then start another pass so immediate
  // COMPLETE is not stuck until the next interval tick.
  if (syncPromise) {
    try {
      await syncPromise;
    } catch {
      /* ignore */
    }
  }
  void runSync("enqueue");
  return item;
}
