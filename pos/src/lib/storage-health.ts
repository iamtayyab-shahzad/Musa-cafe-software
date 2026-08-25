import type { OfflineAction, Order } from "@/types";

export type CacheRow = { key: string; data: unknown; updated_at?: string };

export type HealRemoval = {
  store: string;
  key?: string;
  reason: string;
};

export type HealReport = {
  removed: HealRemoval[];
  cacheRows: number;
  queueRows: number;
};

export function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object";
}

/** A cache object-store record must have a string key and a defined data payload. */
export function isValidCacheRow(value: unknown): value is CacheRow {
  if (!isNonNullObject(value)) return false;
  if (typeof value.key !== "string" || !value.key) return false;
  if (!("data" in value)) return false;
  if (value.data === null || value.data === undefined) return false;
  return true;
}

export function isValidOrderRow(value: unknown): value is Order {
  if (!isNonNullObject(value)) return false;
  return typeof value.id === "string" && value.id.length > 0;
}

export function isValidQueueAction(value: unknown): value is OfflineAction {
  if (!isNonNullObject(value)) return false;
  if (typeof value.id !== "string" || !value.id) return false;
  if (typeof value.type !== "string" || !value.type) return false;
  if (typeof value.created_at !== "string" || !value.created_at) return false;
  return true;
}

export function compactCacheRows(rows: unknown[]): CacheRow[] {
  return rows.filter(isValidCacheRow);
}

export function compactOrders(rows: unknown[]): Order[] {
  return rows.filter(isValidOrderRow);
}

export function compactQueueActions(rows: unknown[]): OfflineAction[] {
  return rows.filter(isValidQueueAction);
}

/** Never persist null/undefined into IndexedDB cache. Empty array/object is OK. */
export function shouldWriteCacheData(data: unknown): boolean {
  return data !== null && data !== undefined;
}

export function orderIdsFromSyncAction(action: Pick<OfflineAction, "payload">): string[] {
  const p = action.payload;
  if (!isNonNullObject(p)) return [];
  const ids: string[] = [];
  if (typeof p.id === "string" && p.id) ids.push(p.id);
  if (typeof p.localId === "string" && p.localId) ids.push(p.localId);
  const input = p.input;
  if (isNonNullObject(input) && typeof input.client_order_id === "string") {
    if (input.client_order_id) ids.push(input.client_order_id);
  }
  return [...new Set(ids)];
}

export function isOrderSyncActionType(type: string): boolean {
  return (
    type === "CREATE_ORDER" ||
    type === "COMPLETE_ORDER" ||
    type === "CANCEL_ORDER" ||
    type === "UPDATE_ORDER"
  );
}
