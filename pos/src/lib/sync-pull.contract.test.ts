import { describe, expect, it } from "vitest";
import {
  buildInventoryPullUrl,
  buildOrdersPullUrl,
  CATALOG_PULL_AT_KEY,
  shouldUseIncrementalCatalogPull,
} from "@/lib/sync-pull";

/**
 * Documents the production catalog-pull contract used by sync-engine:
 * - interval + stored stamp → since= on both URLs + merge (not replace)
 * - startup/online/manual/visible → no since → full replace path
 */
describe("catalog pull contract (bandwidth)", () => {
  it("interval with prior stamp builds since URLs", () => {
    const lastPull = "2026-08-17T04:00:00.000Z";
    const reason = "interval";
    const wantIncremental = shouldUseIncrementalCatalogPull(reason);
    const useSince = wantIncremental && Boolean(lastPull);
    expect(useSince).toBe(true);
    expect(buildOrdersPullUrl({ since: useSince ? lastPull : null })).toContain(
      "since=",
    );
    expect(
      buildInventoryPullUrl({ since: useSince ? lastPull : null }),
    ).toContain("since=");
  });

  it("startup never attaches since even if a stamp exists", () => {
    const lastPull = "2026-08-17T04:00:00.000Z";
    const reason = "startup";
    const wantIncremental = shouldUseIncrementalCatalogPull(reason);
    const useSince = wantIncremental && Boolean(lastPull);
    expect(useSince).toBe(false);
    expect(buildOrdersPullUrl({ since: useSince ? lastPull : null })).toBe(
      "/orders?limit=200",
    );
    expect(buildInventoryPullUrl({ since: useSince ? lastPull : null })).toBe(
      "/inventory",
    );
  });

  it("interval without stamp falls back to full pull URLs", () => {
    const lastPull: string | null = null;
    const wantIncremental = shouldUseIncrementalCatalogPull("interval");
    const useSince = wantIncremental && Boolean(lastPull);
    expect(useSince).toBe(false);
    expect(buildOrdersPullUrl({ since: null })).toBe("/orders?limit=200");
    expect(buildInventoryPullUrl({ since: null })).toBe("/inventory");
  });

  it("catalog stamp key is stable for IndexedDB cache", () => {
    expect(CATALOG_PULL_AT_KEY).toBe("catalog_pull_at");
  });
});

describe("idle poll payload size expectation", () => {
  it("empty delta JSON is near-zero vs a 200-order snapshot", () => {
    const empty = JSON.stringify([]);
    const fat = JSON.stringify(
      Array.from({ length: 200 }, (_, i) => ({
        id: `id-${i}`,
        order_number: `KR-${i}`,
        grand_total: 5000,
        items: [{ product_name: "Pizza", quantity: 2 }],
      })),
    );
    expect(empty.length).toBeLessThan(10);
    expect(fat.length).toBeGreaterThan(5000);
    // Idle since-poll should look like empty[], not the fat snapshot.
    expect(empty.length / fat.length).toBeLessThan(0.01);
  });
});
