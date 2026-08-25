import { openDB, type DBSchema, type IDBPDatabase, type StoreNames } from "idb";
import type {
  Category,
  Customer,
  InventoryItem,
  OfflineAction,
  Order,
  PendingDraft,
  Product,
  Settings,
} from "@/types";
import {
  compactOrders,
  compactQueueActions,
  isOrderSyncActionType,
  isValidCacheRow,
  isValidOrderRow,
  isValidQueueAction,
  orderIdsFromSyncAction,
  shouldWriteCacheData,
  type HealReport,
} from "@/lib/storage-health";
import { shop } from "@/lib/shop";

export type CachedSession = {
  username: string;
  token: string;
  exp: number | null;
  saved_at: string;
};

interface PosDB extends DBSchema {
  pending_drafts: {
    key: string;
    value: PendingDraft;
  };
  offline_queue: {
    key: string;
    value: OfflineAction;
    indexes: { "by-synced": number };
  };
  cache: {
    key: string;
    value: { key: string; data: unknown; updated_at: string };
  };
  products: {
    key: string;
    value: Product;
    indexes: { "by-category": string };
  };
  categories: {
    key: string;
    value: Category;
    indexes: { "by-order": number };
  };
  orders: {
    key: string;
    value: Order;
    indexes: { "by-status": string; "by-created": string };
  };
  inventory: {
    key: string;
    value: InventoryItem;
  };
  settings: {
    key: string;
    value: Settings & { id: string };
  };
  session: {
    key: string;
    value: CachedSession & { id: string };
  };
  customers: {
    key: string;
    value: Customer;
    indexes: { "by-phone": string };
  };
}

const DB_NAME = shop.posDbName;
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<PosDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<PosDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("pending_drafts", { keyPath: "id" });
          const queue = db.createObjectStore("offline_queue", {
            keyPath: "id",
          });
          queue.createIndex("by-synced", "synced");
          db.createObjectStore("cache", { keyPath: "key" });
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains("products")) {
            const products = db.createObjectStore("products", {
              keyPath: "id",
            });
            products.createIndex("by-category", "category_id");
          }
          if (!db.objectStoreNames.contains("categories")) {
            const categories = db.createObjectStore("categories", {
              keyPath: "id",
            });
            categories.createIndex("by-order", "display_order");
          }
          if (!db.objectStoreNames.contains("orders")) {
            const orders = db.createObjectStore("orders", { keyPath: "id" });
            orders.createIndex("by-status", "order_status");
            orders.createIndex("by-created", "created_at");
          }
          if (!db.objectStoreNames.contains("inventory")) {
            db.createObjectStore("inventory", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("settings")) {
            db.createObjectStore("settings", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("session")) {
            db.createObjectStore("session", { keyPath: "id" });
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains("customers")) {
            const customers = db.createObjectStore("customers", {
              keyPath: "id",
            });
            customers.createIndex("by-phone", "phone");
          }
        }
      },
    });
  }
  return dbPromise;
}

type PosStoreName = StoreNames<PosDB>;

async function getAllSafe<Name extends PosStoreName>(
  store: Name,
): Promise<PosDB[Name]["value"][]> {
  const db = await getDb();
  const all = await db.getAll<Name>(store);
  return (all || []).filter(
    (row): row is PosDB[Name]["value"] =>
      row != null && typeof row === "object",
  );
}

function logStorageHeal(message: string, extra?: Record<string, unknown>) {
  try {
    console.warn("[pos-storage-heal]", message, extra || {});
  } catch {
    /* ignore */
  }
}

function isUnsyncedOrder(order: Order): boolean {
  return (
    order.sync_status === "pending_sync" ||
    order.sync_status === "local" ||
    order.sync_status === "sync_failed"
  );
}

/** Cart drafts (bill in progress) */
export async function saveDraft(draft: PendingDraft) {
  const db = await getDb();
  await db.put("pending_drafts", draft);
}

export const saveCartDraft = saveDraft;

export async function listDrafts() {
  return getAllSafe("pending_drafts");
}

export const listCartDrafts = listDrafts;

export async function getDraft(id: string) {
  const db = await getDb();
  return db.get("pending_drafts", id);
}

export async function deleteDraft(id: string) {
  const db = await getDb();
  await db.delete("pending_drafts", id);
}

export async function enqueueAction(
  action: Omit<OfflineAction, "id" | "created_at" | "synced">,
) {
  if (!action?.type) {
    throw new Error("Cannot enqueue a sync action without a type");
  }
  const db = await getDb();
  const item: OfflineAction = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    synced: false,
    ...action,
  };
  if (!isValidQueueAction(item)) {
    throw new Error("Cannot enqueue a malformed sync action");
  }
  await db.put("offline_queue", item);
  return item;
}

export async function listPendingActions() {
  const all = compactQueueActions(await getAllSafe("offline_queue"));
  return all
    .filter((a) => !a.synced && !a.dead)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function listDeadActions() {
  const all = compactQueueActions(await getAllSafe("offline_queue"));
  return all.filter((a) => a.dead && !a.synced);
}

export async function findPendingCreateByClientId(clientOrderId: string) {
  const pending = await listPendingActions();
  return pending.find((a) => {
    if (a.type !== "CREATE_ORDER") return false;
    const p = a.payload as {
      localId?: string;
      input?: { client_order_id?: string };
    };
    return (
      p.localId === clientOrderId ||
      p.input?.client_order_id === clientOrderId
    );
  });
}

export async function markActionSynced(id: string) {
  const db = await getDb();
  const item = await db.get("offline_queue", id);
  if (!item) return;
  item.synced = true;
  item.dead = false;
  delete item.error;
  await db.put("offline_queue", item);
}

export async function markActionError(
  id: string,
  error: string,
  extra?: { attempts?: number; next_retry_at?: string; dead?: boolean },
) {
  const db = await getDb();
  const item = await db.get("offline_queue", id);
  if (!item || !isValidQueueAction(item)) return;
  item.error = error;
  if (extra?.attempts != null) item.attempts = extra.attempts;
  if (extra?.next_retry_at) item.next_retry_at = extra.next_retry_at;
  if (extra?.dead) item.dead = true;
  await db.put("offline_queue", item);
  if (extra?.dead && isOrderSyncActionType(item.type)) {
    await markRelatedOrdersSyncFailed(item);
    try {
      const { notifyOrdersChanged } = await import("@/lib/offline-events");
      notifyOrdersChanged();
    } catch {
      /* ignore */
    }
  }
}

export async function reviveDeadAction(id: string) {
  const db = await getDb();
  const item = await db.get("offline_queue", id);
  if (!item || !isValidQueueAction(item)) return;
  item.dead = false;
  item.attempts = 0;
  delete item.next_retry_at;
  delete item.error;
  await db.put("offline_queue", item);
  if (isOrderSyncActionType(item.type)) {
    await restoreRelatedOrdersPendingSync(item);
    try {
      const { notifyOrdersChanged } = await import("@/lib/offline-events");
      notifyOrdersChanged();
    } catch {
      /* ignore */
    }
  }
}

export async function discardAction(id: string) {
  const db = await getDb();
  await db.delete("offline_queue", id);
}

export async function pruneSyncedActions(keepLast = 50) {
  const db = await getDb();
  const all = compactQueueActions(await getAllSafe("offline_queue"));
  const synced = all
    .filter((a) => a.synced)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const item of synced.slice(keepLast)) {
    await db.delete("offline_queue", item.id);
  }
  // Never delete dead order sync actions — those payloads are the only way
  // to upload after a long outage. Cap only unrelated dead items.
  const orderTypes = new Set([
    "CREATE_ORDER",
    "COMPLETE_ORDER",
    "CANCEL_ORDER",
    "UPDATE_ORDER",
  ]);
  const deadOther = all
    .filter((a) => a.dead && !a.synced && !orderTypes.has(a.type))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const item of deadOther.slice(50)) {
    await db.delete("offline_queue", item.id);
  }
}

const ID_MAP_KEY = "order_id_map";

export async function mapLocalToServerId(localId: string, serverId: string) {
  const map = (await cacheGet<Record<string, string>>(ID_MAP_KEY)) || {};
  map[localId] = serverId;
  const entries = Object.entries(map);
  if (entries.length <= 500) {
    await cacheSet(ID_MAP_KEY, map);
    return;
  }
  // Prefer keeping ids still referenced by the offline queue.
  const queue = await listPendingActions();
  const dead = await listDeadActions();
  const needed = new Set<string>();
  for (const a of [...queue, ...dead]) {
    const p = a.payload as { localId?: string; id?: string };
    if (p.localId) needed.add(p.localId);
    if (p.id) needed.add(p.id);
  }
  needed.add(localId);
  const keep: [string, string][] = [];
  const rest: [string, string][] = [];
  for (const entry of entries) {
    if (needed.has(entry[0]) || needed.has(entry[1])) keep.push(entry);
    else rest.push(entry);
  }
  const trimmed = Object.fromEntries([
    ...keep,
    ...rest.slice(-(400 - Math.min(keep.length, 400))),
  ].slice(-500));
  await cacheSet(ID_MAP_KEY, trimmed);
}

export async function resolveServerOrderId(id: string): Promise<string> {
  const map = (await cacheGet<Record<string, string>>(ID_MAP_KEY)) || {};
  return map[id] || id;
}

export async function pruneCacheKeys(keepKeys: string[]) {
  const db = await getDb();
  const all = await getAllSafe("cache");
  const keep = new Set(keepKeys);
  const operational = [
    "products",
    "categories",
    "orders",
    "inventory",
    "settings",
    "session",
    "customers",
    "locations",
    "offers",
    "recipes",
    "sync_meta",
    "sync_conflicts",
    "order_id_map",
    "discount_rules",
  ];
  for (const row of all) {
    if (!isValidCacheRow(row)) {
      const maybeKey = (row as { key?: unknown }).key;
      const key = typeof maybeKey === "string" ? maybeKey : "";
      if (key) {
        logStorageHeal("deleting malformed cache row during prune", { key });
        await db.delete("cache", key);
      }
      continue;
    }
    if (!keep.has(row.key) && !row.key.startsWith("sync_")) {
      if (!operational.includes(row.key)) {
        await db.delete("cache", row.key);
      }
    }
  }
}

export async function cacheSet(key: string, data: unknown) {
  if (!key) return;
  const db = await getDb();
  if (!shouldWriteCacheData(data)) {
    await db.delete("cache", key);
    return;
  }
  await db.put("cache", {
    key,
    data,
    updated_at: new Date().toISOString(),
  });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.get("cache", key);
  if (!isValidCacheRow(row)) return null;
  return (row.data as T) ?? null;
}

/**
 * Delete null/malformed IndexedDB rows that crash sync and sales totals.
 * Safe to run on every POS startup and from Settings → Clean now.
 */
export async function healIndexedDb(): Promise<HealReport> {
  const report: HealReport = { removed: [], cacheRows: 0, queueRows: 0 };
  const db = await getDb();

  const cacheTx = db.transaction("cache", "readwrite");
  let cacheCursor = await cacheTx.store.openCursor();
  while (cacheCursor) {
    const value = cacheCursor.value as unknown;
    report.cacheRows += 1;
    if (!isValidCacheRow(value)) {
      const key =
        value &&
        typeof value === "object" &&
        typeof (value as { key?: unknown }).key === "string"
          ? (value as { key: string }).key
          : String(cacheCursor.key);
      report.removed.push({
        store: "cache",
        key,
        reason: "null or malformed cache row",
      });
      await cacheCursor.delete();
    }
    cacheCursor = await cacheCursor.continue();
  }
  await cacheTx.done;

  const queueTx = db.transaction("offline_queue", "readwrite");
  let queueCursor = await queueTx.store.openCursor();
  while (queueCursor) {
    const value = queueCursor.value as unknown;
    report.queueRows += 1;
    if (!isValidQueueAction(value)) {
      const key =
        value &&
        typeof value === "object" &&
        typeof (value as { id?: unknown }).id === "string"
          ? (value as { id: string }).id
          : String(queueCursor.key);
      report.removed.push({
        store: "offline_queue",
        key,
        reason: "null or malformed queue row",
      });
      await queueCursor.delete();
    }
    queueCursor = await queueCursor.continue();
  }
  await queueTx.done;

  const orderTx = db.transaction("orders", "readwrite");
  let orderCursor = await orderTx.store.openCursor();
  while (orderCursor) {
    const value = orderCursor.value as unknown;
    if (!isValidOrderRow(value)) {
      report.removed.push({
        store: "orders",
        key: String(orderCursor.key),
        reason: "null or malformed order row",
      });
      await orderCursor.delete();
    }
    orderCursor = await orderCursor.continue();
  }
  await orderTx.done;

  if (report.removed.length) {
    logStorageHeal("removed malformed IndexedDB rows", {
      count: report.removed.length,
      rows: report.removed,
    });
  }
  return report;
}

export async function countSyncFailedOrders() {
  const orders = await listLocalOrders();
  return orders.filter((o) => o.sync_status === "sync_failed").length;
}

export async function listSyncFailedOrders() {
  const orders = await listLocalOrders();
  return orders.filter((o) => o.sync_status === "sync_failed");
}

async function markRelatedOrdersSyncFailed(action: OfflineAction) {
  const ids = new Set(orderIdsFromSyncAction(action));
  if (!ids.size) return;
  const locals = await listLocalOrders();
  const now = new Date().toISOString();
  for (const order of locals) {
    if (
      !ids.has(order.id) &&
      !(order.client_order_id && ids.has(order.client_order_id))
    ) {
      continue;
    }
    await upsertLocalOrder({
      ...order,
      updated_at: now,
      sync_status: "sync_failed",
    });
  }
}

async function restoreRelatedOrdersPendingSync(action: OfflineAction) {
  const ids = new Set(orderIdsFromSyncAction(action));
  if (!ids.size) return;
  const locals = await listLocalOrders();
  const now = new Date().toISOString();
  for (const order of locals) {
    if (
      !ids.has(order.id) &&
      !(order.client_order_id && ids.has(order.client_order_id))
    ) {
      continue;
    }
    if (order.sync_status !== "sync_failed") continue;
    await upsertLocalOrder({
      ...order,
      updated_at: now,
      sync_status: "pending_sync",
    });
  }
}

/** Test-only: close the cached IDB connection so suites can rebuild a dirty DB. */
export async function closePosDbForTests() {
  if (!dbPromise) return;
  const db = await dbPromise;
  db.close();
  dbPromise = null;
}

/** Test-only: write a cache row the production app would now refuse (data: null). */
export async function putRawCacheRowForTests(key: string, data: unknown) {
  const db = await getDb();
  await db.put("cache", {
    key,
    data,
    updated_at: new Date().toISOString(),
  });
}

export async function replaceProducts(products: Product[]) {
  if (!Array.isArray(products)) return;
  const clean = products.filter((p) => p && typeof p.id === "string");
  const db = await getDb();
  const tx = db.transaction("products", "readwrite");
  await tx.store.clear();
  for (const p of clean) await tx.store.put(p);
  await tx.done;
  await cacheSet("products", clean);
}

export async function listLocalProducts() {
  const rows = (await getAllSafe("products")).filter(
    (p) => p && typeof p.id === "string",
  );
  if (rows.length) return rows;
  const cached = await cacheGet<Product[]>("products");
  return Array.isArray(cached) ? cached.filter((p) => p && typeof p.id === "string") : [];
}

export async function replaceCategories(categories: Category[]) {
  if (!Array.isArray(categories)) return;
  const clean = categories.filter((c) => c && typeof c.id === "string");
  const db = await getDb();
  const tx = db.transaction("categories", "readwrite");
  await tx.store.clear();
  for (const c of clean) await tx.store.put(c);
  await tx.done;
  await cacheSet("categories", clean);
}

export async function listLocalCategories() {
  const rows = (await getAllSafe("categories")).filter(
    (c) => c && typeof c.id === "string",
  );
  if (rows.length) return rows;
  const cached = await cacheGet<Category[]>("categories");
  return Array.isArray(cached) ? cached.filter((c) => c && typeof c.id === "string") : [];
}

function capOrdersKeepingUnsynced(orders: Order[], limit = 2000): Order[] {
  const sorted = compactOrders(orders)
    .slice()
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const unsynced = sorted.filter(isUnsyncedOrder);
  const rest = sorted.filter((o) => !isUnsyncedOrder(o));
  const kept = [...unsynced];
  const seen = new Set(kept.map((o) => o.id));
  for (const row of rest) {
    if (kept.length >= limit) break;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    kept.push(row);
  }
  return kept.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function replaceOrders(orders: Order[]) {
  if (!Array.isArray(orders)) return;
  const db = await getDb();
  const capped = capOrdersKeepingUnsynced(orders);
  const tx = db.transaction("orders", "readwrite");
  await tx.store.clear();
  for (const o of capped) {
    if (!isValidOrderRow(o)) continue;
    await tx.store.put(o);
  }
  await tx.done;
  await rebuildCustomersFromOrders(capped);
}

/** Keep local COMPLETED sales for this many Karachi calendar days past today. */
const PRESERVE_COMPLETED_DAYS = 45;

function orderCreatedMs(order: Order): number {
  return Date.parse(order.created_at || "") || 0;
}

/**
 * Replace IDB orders from a server snapshot while keeping:
 * - unsynced local rows (offline creates / pending status changes)
 * - recent local COMPLETED/CANCELLED that fell off the server's limit=100 window
 *   (otherwise dashboard/history sales silently shrink on busy days)
 */
export async function replaceOrdersPreservingUnsynced(serverOrders: Order[]) {
  if (!Array.isArray(serverOrders)) return;
  const { findOrderByIdentity, ordersShareIdentity, preferEarlierCreatedAt } =
    await import("@/lib/order-identity");
  const existing = await listLocalOrders();
  const idMap =
    (await cacheGet<Record<string, string>>(ID_MAP_KEY)) || {};
  const cleanServer = compactOrders(serverOrders);
  const serverIds = new Set(cleanServer.map((r) => r.id));
  const serverClientIds = new Set(
    cleanServer
      .map((r) => r.client_order_id)
      .filter((id): id is string => Boolean(id)),
  );
  const mappedServerIds = new Set(Object.values(idMap));

  const preserveAfterMs =
    Date.now() - PRESERVE_COMPLETED_DAYS * 24 * 60 * 60 * 1000;

  const unsynced = existing.filter((o) => {
    const pendingLocal = isUnsyncedOrder(o);
    if (!pendingLocal) return false;
    // Drop LOCAL-* once server already has the same client_order_id.
    if (o.client_order_id && serverClientIds.has(o.client_order_id)) {
      return false;
    }
    if (idMap[o.id] && serverIds.has(idMap[o.id])) return false;
    if (serverIds.has(o.id) && o.order_status === "PENDING") {
      // Server row wins for still-pending synced ids; keep local if status diverged.
      return false;
    }
    return !serverIds.has(o.id) || o.order_status !== "PENDING";
  });

  const recentTerminal = existing.filter((o) => {
    if (o.order_status !== "COMPLETED" && o.order_status !== "CANCELLED") {
      return false;
    }
    if (serverIds.has(o.id)) return false;
    if (o.client_order_id && serverClientIds.has(o.client_order_id)) {
      return false;
    }
    if (idMap[o.id] && serverIds.has(idMap[o.id])) return false;
    if (mappedServerIds.has(o.id)) return false;
    const created = orderCreatedMs(o);
    return created >= preserveAfterMs;
  });

  const byId = new Map<string, Order>();
  for (const s of cleanServer) {
    const loc = findOrderByIdentity(existing, s, idMap);
    const createdAt = loc
      ? preferEarlierCreatedAt(loc.created_at, s.created_at)
      : s.created_at;
    const clientOrderId =
      s.client_order_id || loc?.client_order_id || loc?.id || undefined;
    if (
      loc &&
      (loc.sync_status === "pending_sync" || loc.sync_status === "sync_failed") &&
      (loc.order_status === "COMPLETED" || loc.order_status === "CANCELLED")
    ) {
      byId.set(s.id, {
        ...s,
        client_order_id: clientOrderId,
        created_at: createdAt,
        order_status: loc.order_status,
        sync_status: loc.sync_status,
      });
    } else {
      byId.set(s.id, {
        ...s,
        client_order_id: clientOrderId,
        created_at: createdAt,
        sync_status: "synced" as const,
      });
    }
  }
  const identityTaken = (row: Order) =>
    [...byId.values()].some((existingRow) =>
      ordersShareIdentity(existingRow, row),
    );
  for (const o of unsynced) {
    if (!byId.has(o.id) && !identityTaken(o)) byId.set(o.id, o);
  }
  for (const o of recentTerminal) {
    if (!byId.has(o.id) && !identityTaken(o)) byId.set(o.id, o);
  }
  await replaceOrders(Array.from(byId.values()));
}

/** Upsert without wiping history — used by pending polls. Dedupes identities.
 *  Never lets a PENDING incoming row overwrite a local COMPLETED/CANCELLED twin.
 */
export async function mergeOrders(orders: Order[]) {
  const {
    dedupeOrdersByIdentity,
    ordersShareIdentity,
    preferEarlierCreatedAt,
  } = await import("@/lib/order-identity");
  const db = await getDb();
  const existing = compactOrders(await getAllSafe("orders"));
  const byId = new Map(existing.map((o) => [o.id, o]));

  for (const incoming of orders) {
    for (const [id, row] of [...byId.entries()]) {
      if (id === incoming.id) continue;
      if (ordersShareIdentity(row, incoming)) {
        // Keep terminal local twin; drop only if incoming is also terminal or pending twin of pending.
        if (
          (row.order_status === "COMPLETED" ||
            row.order_status === "CANCELLED") &&
          incoming.order_status === "PENDING"
        ) {
          // Do not delete the completed row — skip absorbing this pending identity.
          continue;
        }
        byId.delete(id);
      }
    }
    const previous = byId.get(incoming.id);
    const previousTerminal =
      previous &&
      (previous.order_status === "COMPLETED" ||
        previous.order_status === "CANCELLED");
    const identityTerminal = [...byId.values()].find(
      (row) =>
        ordersShareIdentity(row, incoming) &&
        (row.order_status === "COMPLETED" ||
          row.order_status === "CANCELLED"),
    );

    if (
      incoming.order_status === "PENDING" &&
      (previousTerminal || identityTerminal)
    ) {
      // Stale server PENDING must not resurrect a ticket the cashier finished.
      continue;
    }

    byId.set(
      incoming.id,
      previous
        ? {
            ...previous,
            ...incoming,
            client_order_id:
              incoming.client_order_id ||
              previous.client_order_id ||
              previous.id,
            created_at: preferEarlierCreatedAt(
              previous.created_at,
              incoming.created_at,
            ),
          }
        : incoming,
    );
  }

  const merged = capOrdersKeepingUnsynced(
    dedupeOrdersByIdentity(Array.from(byId.values())),
  );
  const tx = db.transaction("orders", "readwrite");
  await tx.store.clear();
  for (const o of merged) {
    if (!isValidOrderRow(o)) continue;
    await tx.store.put(o);
  }
  await tx.done;
}

export async function upsertLocalOrder(order: Order) {
  if (!isValidOrderRow(order)) {
    throw new Error("Cannot save an order without an id");
  }
  const { ordersShareIdentity } = await import("@/lib/order-identity");
  const db = await getDb();
  const all = compactOrders(await getAllSafe("orders"));
  for (const row of all) {
    if (row.id !== order.id && ordersShareIdentity(row, order)) {
      await db.delete("orders", row.id);
    }
  }
  const existed = all.some(
    (row) => row.id === order.id || ordersShareIdentity(row, order),
  );
  await db.put("orders", order);
  await upsertCustomerFromOrder(order, !existed);
}

export async function deleteLocalOrder(id: string) {
  const db = await getDb();
  await db.delete("orders", id);
}

export async function listLocalOrders() {
  const { dedupeOrdersByIdentity } = await import("@/lib/order-identity");
  const rows = compactOrders(await getAllSafe("orders"));
  return dedupeOrdersByIdentity(rows);
}

export async function listLocalPendingOrders() {
  const all = await listLocalOrders();
  return all.filter((o) => o.order_status === "PENDING");
}

export async function replaceInventory(items: InventoryItem[]) {
  if (!Array.isArray(items)) return;
  const clean = items.filter((item) => item && typeof item.id === "string");
  const db = await getDb();
  const tx = db.transaction("inventory", "readwrite");
  await tx.store.clear();
  for (const item of clean) await tx.store.put(item);
  await tx.done;
  await cacheSet("inventory", clean);
}

/** Upsert changed inventory rows without clearing the store (incremental sync). */
export async function mergeInventory(items: InventoryItem[]) {
  if (!Array.isArray(items) || !items.length) return;
  const clean = items.filter((item) => item && typeof item.id === "string");
  if (!clean.length) return;
  const db = await getDb();
  const tx = db.transaction("inventory", "readwrite");
  for (const item of clean) await tx.store.put(item);
  await tx.done;
  const all = (await getAllSafe("inventory")).filter(
    (item) => item && typeof item.id === "string",
  );
  await cacheSet("inventory", all);
}

export async function listLocalInventory() {
  const rows = (await getAllSafe("inventory")).filter(
    (item) => item && typeof item.id === "string",
  );
  if (rows.length) return rows;
  const cached = await cacheGet<InventoryItem[]>("inventory");
  return Array.isArray(cached)
    ? cached.filter((item) => item && typeof item.id === "string")
    : [];
}

export async function saveLocalSettings(settings: Settings) {
  if (!settings || typeof settings !== "object") return;
  const db = await getDb();
  await db.put("settings", { ...settings, id: settings.id || "default" });
  await cacheSet("settings", settings);
}

export async function getLocalSettings() {
  const db = await getDb();
  const row = await db.get("settings", "default");
  if (row) {
    return row as Settings;
  }
  return cacheGet<Settings>("settings");
}

export async function saveSession(session: CachedSession) {
  if (!session?.token) return;
  const db = await getDb();
  await db.put("session", { ...session, id: "current" });
  await cacheSet("session", session);
}

export async function getSession() {
  const db = await getDb();
  const row = await db.get("session", "current");
  if (row) {
    return {
      username: row.username,
      token: row.token,
      exp: row.exp,
      saved_at: row.saved_at,
    };
  }
  return cacheGet<CachedSession>("session");
}

export async function clearSession() {
  const db = await getDb();
  await db.delete("session", "current");
  await db.delete("cache", "session");
}

export async function replaceCustomers(customers: Customer[]) {
  if (!Array.isArray(customers)) return;
  const clean = customers.filter((c) => c && typeof c.id === "string");
  const db = await getDb();
  const tx = db.transaction("customers", "readwrite");
  await tx.store.clear();
  for (const c of clean) await tx.store.put(c);
  await tx.done;
  await cacheSet("customers", clean);
}

export async function listLocalCustomers() {
  const rows = (await getAllSafe("customers")).filter(
    (c) => c && typeof c.id === "string",
  );
  if (rows.length) return rows;
  const cached = await cacheGet<Customer[]>("customers");
  return Array.isArray(cached)
    ? cached.filter((c) => c && typeof c.id === "string")
    : [];
}

async function upsertCustomerFromOrder(order: Order, isNewOrder: boolean) {
  if (!order.phone || order.phone === "0000000000") return;
  const { normalizePkPhone } = await import("@/lib/utils");
  const phone = normalizePkPhone(order.phone);
  if (!phone || phone === "0000000000") return;
  const db = await getDb();
  const id = order.customer_id || `phone:${phone}`;
  const existing = await db.get("customers", id);
  const newer =
    !existing || order.created_at >= existing.last_order_at;
  const customer: Customer = {
    id,
    name: newer
      ? order.customer_name || existing?.name || "Customer"
      : existing.name,
    phone,
    address: newer
      ? order.address || existing?.address || ""
      : existing.address,
    last_order_at: newer ? order.created_at : existing.last_order_at,
    order_count: isNewOrder
      ? (existing?.order_count || 0) + 1
      : existing?.order_count || 1,
    last_location_id: newer
      ? order.location_id || existing?.last_location_id
      : existing?.last_location_id,
  };
  await db.put("customers", customer);
  const all = (await getAllSafe("customers")).filter(
    (c) => c && typeof c.id === "string",
  );
  await cacheSet("customers", all);
}

async function rebuildCustomersFromOrders(orders: Order[]) {
  const { normalizePkPhone } = await import("@/lib/utils");
  const map = new Map<string, Customer>();
  for (const order of orders) {
    if (!order.phone || order.phone === "0000000000") continue;
    const phone = normalizePkPhone(order.phone);
    if (!phone || phone === "0000000000") continue;
    const id = order.customer_id || `phone:${phone}`;
    const prev = map.get(id);
    if (!prev) {
      map.set(id, {
        id,
        name: order.customer_name || "Customer",
        phone,
        address: order.address || "",
        last_order_at: order.created_at,
        order_count: 1,
        last_location_id: order.location_id || undefined,
      });
    } else {
      prev.order_count += 1;
      if (order.created_at > prev.last_order_at) {
        prev.last_order_at = order.created_at;
        prev.name = order.customer_name || prev.name;
        prev.address = order.address || prev.address;
        if (order.location_id) prev.last_location_id = order.location_id;
      }
    }
  }
  await replaceCustomers(Array.from(map.values()));
}

/** Prefix search on cached customers (normalized PK digits). */
export async function searchLocalCustomersByPhone(
  query: string,
  limit = 12,
): Promise<Customer[]> {
  const { normalizePkPhone } = await import("@/lib/utils");
  const digits = normalizePkPhone(query);
  if (digits.length < 4 || digits === "0000000000") return [];

  const all = await listLocalCustomers();
  const matches = all
    .filter((c) => {
      const phone = normalizePkPhone(c.phone || "");
      return (
        phone.length >= 4 &&
        phone !== "0000000000" &&
        phone.startsWith(digits)
      );
    })
    .sort((a, b) =>
      (b.last_order_at || "").localeCompare(a.last_order_at || ""),
    );

  return matches.slice(0, limit);
}

/** Upsert remote lookup rows into the local customers store. */
export async function upsertCustomersFromLookup(
  rows: Array<{
    phone: string;
    name: string;
    address: string;
    location_id?: string | null;
    last_order_at: string;
    order_count: number;
  }>,
) {
  if (!rows.length) return;
  const { normalizePkPhone } = await import("@/lib/utils");
  const db = await getDb();
  for (const row of rows) {
    const phone = normalizePkPhone(row.phone);
    if (!phone || phone === "0000000000") continue;
    const id = `phone:${phone}`;
    const existing = await db.get("customers", id);
    const newer =
      !existing ||
      (row.last_order_at || "") >= (existing.last_order_at || "");
    const customer: Customer = {
      id,
      name: newer
        ? row.name || existing?.name || "Customer"
        : existing.name,
      phone,
      address: newer
        ? row.address || existing?.address || ""
        : existing.address,
      last_order_at: newer
        ? row.last_order_at || existing?.last_order_at || new Date().toISOString()
        : existing.last_order_at,
      order_count: Math.max(row.order_count || 1, existing?.order_count || 1),
      last_location_id: newer
        ? row.location_id || existing?.last_location_id
        : existing?.last_location_id,
    };
    await db.put("customers", customer);
  }
  const all = (await getAllSafe("customers")).filter(
    (c) => c && typeof c.id === "string",
  );
  await cacheSet("customers", all);
}
