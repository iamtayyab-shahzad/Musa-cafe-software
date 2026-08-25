/** Pure helpers for catalog pull URLs — kept tiny so bandwidth logic is testable. */

export const CATALOG_PULL_AT_KEY = "catalog_pull_at";

/** Interval polls may send since=; startup / reconnect / manual / visible stay full. */
export function shouldUseIncrementalCatalogPull(reason: string): boolean {
  return reason === "interval";
}

export function buildOrdersPullUrl(opts: {
  since?: string | null;
  limit?: number;
}): string {
  const limit = opts.limit ?? 200;
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (opts.since) params.set("since", opts.since);
  return `/orders?${params.toString()}`;
}

export function buildInventoryPullUrl(opts: { since?: string | null }): string {
  if (!opts.since) return "/inventory";
  return `/inventory?since=${encodeURIComponent(opts.since)}`;
}
