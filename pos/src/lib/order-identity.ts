import type { Order } from "@/types";

/**
 * One logical ticket can exist under a client UUID (LOCAL-*) and a server UUID
 * at the same time during sync. Treat those as the same order.
 */
export function orderIdentityKeys(order: Pick<Order, "id" | "client_order_id">) {
  const keys = new Set<string>();
  if (order.id) keys.add(order.id);
  if (order.client_order_id) keys.add(order.client_order_id);
  return keys;
}

export function ordersShareIdentity(
  a: Pick<Order, "id" | "client_order_id">,
  b: Pick<Order, "id" | "client_order_id">,
) {
  if (a.id && (a.id === b.id || a.id === b.client_order_id)) return true;
  if (
    a.client_order_id &&
    (a.client_order_id === b.id || a.client_order_id === b.client_order_id)
  ) {
    return true;
  }
  return false;
}

/** Keep the original sale timestamp — never let sync time replace place time. */
export function preferEarlierCreatedAt(
  a?: string | null,
  b?: string | null,
): string {
  const ta = Date.parse(a || "");
  const tb = Date.parse(b || "");
  if (!Number.isFinite(ta) && !Number.isFinite(tb)) {
    return a || b || new Date().toISOString();
  }
  if (!Number.isFinite(ta)) return b as string;
  if (!Number.isFinite(tb)) return a as string;
  return ta <= tb ? (a as string) : (b as string);
}

export function findOrderByIdentity(
  orders: Order[],
  needle: Pick<Order, "id" | "client_order_id">,
  idMap: Record<string, string> = {},
) {
  const mapped = needle.id ? idMap[needle.id] : undefined;
  // Reverse: idMap is local→server; server pending may lack client_order_id.
  let reverseLocalId: string | undefined;
  if (needle.id) {
    for (const [localId, serverId] of Object.entries(idMap)) {
      if (serverId === needle.id) {
        reverseLocalId = localId;
        break;
      }
    }
  }
  return (
    orders.find((o) => ordersShareIdentity(o, needle)) ||
    (mapped
      ? orders.find(
          (o) =>
            o.id === mapped ||
            o.client_order_id === mapped ||
            o.client_order_id === needle.id,
        )
      : undefined) ||
    (reverseLocalId
      ? orders.find(
          (o) =>
            o.id === reverseLocalId ||
            o.client_order_id === reverseLocalId,
        )
      : undefined)
  );
}

function statusRank(status: Order["order_status"]) {
  if (status === "COMPLETED" || status === "CANCELLED") return 2;
  if (status === "PENDING") return 1;
  return 0;
}

function syncRank(status: Order["sync_status"] | undefined) {
  if (status === "pending_sync" || status === "local" || status === "sync_failed")
    return 2;
  if (status === "synced") return 1;
  return 0;
}

/** Prefer terminal local status, then server id, then fresher updated_at. */
export function preferOrder(a: Order, b: Order): Order {
  const statusDiff = statusRank(a.order_status) - statusRank(b.order_status);
  if (statusDiff !== 0) return statusDiff > 0 ? a : b;

  // Same status family: keep an in-flight local terminal override.
  if (
    a.order_status !== "PENDING" &&
    b.order_status === a.order_status &&
    syncRank(a.sync_status) !== syncRank(b.sync_status)
  ) {
    return syncRank(a.sync_status) > syncRank(b.sync_status) ? a : b;
  }

  const aLocal = a.order_number?.startsWith("LOCAL-") ? 1 : 0;
  const bLocal = b.order_number?.startsWith("LOCAL-") ? 1 : 0;
  if (aLocal !== bLocal) return aLocal < bLocal ? a : b;

  const aTime = Date.parse(a.updated_at || a.created_at || "") || 0;
  const bTime = Date.parse(b.updated_at || b.created_at || "") || 0;
  if (aTime !== bTime) return aTime >= bTime ? a : b;
  return a;
}

/**
 * Collapse client-id + server-id duplicates into one row per logical order.
 */
export function dedupeOrdersByIdentity(orders: Order[]): Order[] {
  const groups: Order[][] = [];

  for (const order of orders) {
    if (!order || !order.id) continue;
    let matched = false;
    for (const group of groups) {
      if (group.some((existing) => ordersShareIdentity(existing, order))) {
        group.push(order);
        matched = true;
        break;
      }
    }
    if (!matched) groups.push([order]);
  }

  return groups
    .map((group) => group.reduce((best, row) => preferOrder(best, row)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export type PendingReconcileResult = {
  pending: Order[];
  /** Local rows that should be rewritten (e.g. mark completed after server drop). */
  localUpdates: Order[];
  /** Local duplicate ids to delete after preferring another identity. */
  deleteIds: string[];
};

/**
 * Build the Pending list from server pending + local orders without duplicates
 * and without resurrecting tickets the cashier already completed/cancelled.
 */
export function reconcilePendingOrders(
  serverPending: Order[],
  localOrders: Order[],
  idMap: Record<string, string> = {},
): PendingReconcileResult {
  const reverseMap: Record<string, string> = {};
  for (const [localId, serverId] of Object.entries(idMap)) {
    reverseMap[serverId] = localId;
  }

  const byIdentity = new Map<string, Order>();
  const deleteIds = new Set<string>();
  const localUpdates: Order[] = [];

  const remember = (order: Order) => {
    const keys = [...orderIdentityKeys(order)];
    if (idMap[order.id]) keys.push(idMap[order.id]);
    if (reverseMap[order.id]) keys.push(reverseMap[order.id]);

    let existingKey: string | undefined;
    let existing: Order | undefined;
    for (const [key, row] of byIdentity) {
      if (ordersShareIdentity(row, order) || keys.includes(key)) {
        existingKey = key;
        existing = row;
        break;
      }
    }

    if (!existing) {
      const primary = order.client_order_id || order.id;
      byIdentity.set(primary, order);
      return;
    }

    const winner = preferOrder(existing, order);
    const loser = winner === existing ? order : existing;
    if (loser.id !== winner.id) deleteIds.add(loser.id);

    for (const [key, row] of [...byIdentity.entries()]) {
      if (row === existing || ordersShareIdentity(row, winner)) {
        byIdentity.delete(key);
      }
    }
    byIdentity.set(winner.client_order_id || winner.id, winner);
    void existingKey;
  };

  for (const row of serverPending) {
    const local = findOrderByIdentity(localOrders, row, idMap);
    if (
      local &&
      (local.order_status === "COMPLETED" ||
        local.order_status === "CANCELLED")
    ) {
      // Never reintroduce server PENDING over a local terminal status.
      // Persist the winner under the server id so deleting LOCAL-* does not
      // wipe completion knowledge (that used to resurrect Pending on next poll).
      const overlay: Order = {
        ...row,
        ...local,
        id: row.id,
        client_order_id:
          local.client_order_id || row.client_order_id || local.id,
        order_status: local.order_status,
        sync_status:
          local.sync_status === "synced"
            ? "synced"
            : local.sync_status === "sync_failed"
              ? "sync_failed"
              : "pending_sync",
        updated_at: local.updated_at || new Date().toISOString(),
      };
      remember(overlay);
      localUpdates.push(overlay);
      if (local.id !== row.id) deleteIds.add(local.id);
      continue;
    }

    remember({
      ...row,
      client_order_id: row.client_order_id || local?.client_order_id || local?.id,
      sync_status: "synced",
    });
  }

  for (const local of localOrders) {
    if (local.order_status !== "PENDING") continue;
    const mappedServerId = idMap[local.id];
    const already = [...byIdentity.values()].some((row) =>
      ordersShareIdentity(row, local) ||
      (mappedServerId &&
        (row.id === mappedServerId || row.client_order_id === local.id)),
    );
    if (already) {
      if (
        mappedServerId &&
        local.id !== mappedServerId &&
        local.order_number?.startsWith("LOCAL-")
      ) {
        deleteIds.add(local.id);
      }
      continue;
    }
    if (
      local.order_number?.startsWith("LOCAL-") ||
      local.sync_status === "pending_sync" ||
      local.sync_status === "local"
    ) {
      remember(local);
    }
  }

  const pending = [...byIdentity.values()].filter(
    (o) => o.order_status === "PENDING",
  );
  const pendingIds = new Set(pending.map((o) => o.id));
  for (const o of pending) {
    if (o.client_order_id) pendingIds.add(o.client_order_id);
  }

  for (const local of localOrders) {
    if (local.order_status !== "PENDING") continue;
    if (pendingIds.has(local.id)) continue;
    if (local.client_order_id && pendingIds.has(local.client_order_id)) {
      deleteIds.add(local.id);
      continue;
    }
    if (idMap[local.id] && pendingIds.has(idMap[local.id])) {
      deleteIds.add(local.id);
      continue;
    }
    if (local.sync_status === "pending_sync" || local.sync_status === "local") {
      continue;
    }
    if (local.order_number?.startsWith("LOCAL-")) continue;

    // Synced PENDING missing from server pending: hide from Pending UI only.
    // Do NOT invent COMPLETED — remote cancel / filter glitches would fake sales.
    // Full /orders refresh (or COMPLETE sync) will set the real status later.
  }

  return {
    pending: dedupeOrdersByIdentity(pending),
    localUpdates,
    deleteIds: [...deleteIds].filter(
      (id) => !pending.some((p) => p.id === id),
    ),
  };
}
