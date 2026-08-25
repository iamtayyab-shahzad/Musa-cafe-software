/**
 * Lightweight window events used to keep the UI in sync with local
 * (IndexedDB) mutations that happen while offline, before the sync engine
 * runs. React Query listeners refresh from IndexedDB immediately.
 */
export const POS_ORDERS_CHANGED_EVENT = "pos-orders-changed";

/** Fired after a background localFirst revalidate writes fresher data to IDB. */
export const POS_CACHE_UPDATED_EVENT = "pos-cache-updated";

export function notifyOrdersChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(POS_ORDERS_CHANGED_EVENT));
}

export function notifyCacheUpdated(keys: string[]) {
  if (typeof window === "undefined" || !keys.length) return;
  window.dispatchEvent(
    new CustomEvent(POS_CACHE_UPDATED_EVENT, { detail: { keys } }),
  );
}
