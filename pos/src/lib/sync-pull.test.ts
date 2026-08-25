import { describe, expect, it } from "vitest";
import {
  buildInventoryPullUrl,
  buildOrdersPullUrl,
  shouldUseIncrementalCatalogPull,
} from "@/lib/sync-pull";

describe("sync-pull bandwidth helpers", () => {
  it("only interval uses incremental since", () => {
    expect(shouldUseIncrementalCatalogPull("interval")).toBe(true);
    expect(shouldUseIncrementalCatalogPull("startup")).toBe(false);
    expect(shouldUseIncrementalCatalogPull("online")).toBe(false);
    expect(shouldUseIncrementalCatalogPull("manual")).toBe(false);
    expect(shouldUseIncrementalCatalogPull("visible")).toBe(false);
    expect(shouldUseIncrementalCatalogPull("enqueue")).toBe(false);
  });

  it("orders URL omits since when absent (old clients / full pull)", () => {
    expect(buildOrdersPullUrl({})).toBe("/orders?limit=200");
    expect(buildOrdersPullUrl({ since: null })).toBe("/orders?limit=200");
    expect(buildOrdersPullUrl({ since: "" })).toBe("/orders?limit=200");
  });

  it("orders URL includes since when present", () => {
    const since = "2026-08-17T05:00:00.000Z";
    expect(buildOrdersPullUrl({ since })).toBe(
      `/orders?limit=200&since=${encodeURIComponent(since)}`,
    );
  });

  it("inventory URL omits since when absent", () => {
    expect(buildInventoryPullUrl({})).toBe("/inventory");
    expect(buildInventoryPullUrl({ since: null })).toBe("/inventory");
  });

  it("inventory URL includes since when present", () => {
    const since = "2026-08-17T05:00:00.000Z";
    expect(buildInventoryPullUrl({ since })).toBe(
      `/inventory?since=${encodeURIComponent(since)}`,
    );
  });
});
