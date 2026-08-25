import { describe, expect, it } from "vitest";
import {
  compactCacheRows,
  compactOrders,
  compactQueueActions,
  isValidCacheRow,
  orderIdsFromSyncAction,
  shouldWriteCacheData,
} from "@/lib/storage-health";

describe("storage-health guards", () => {
  it("rejects null cache rows and null data", () => {
    expect(isValidCacheRow(null)).toBe(false);
    expect(isValidCacheRow({ key: "orders" })).toBe(false);
    expect(isValidCacheRow({ key: "orders", data: null })).toBe(false);
    expect(
      isValidCacheRow({ key: "orders", data: [], updated_at: "x" }),
    ).toBe(true);
  });

  it("compacts mixed getAll results", () => {
    expect(compactCacheRows([null, { key: "a", data: 1 }])).toEqual([
      { key: "a", data: 1 },
    ]);
    expect(compactOrders([null, { id: "o1" } as never])).toHaveLength(1);
    expect(
      compactQueueActions([
        null,
        { id: "q1", type: "CREATE_ORDER", created_at: "t", synced: false },
      ]),
    ).toHaveLength(1);
  });

  it("refuses to write null/undefined cache payloads", () => {
    expect(shouldWriteCacheData(null)).toBe(false);
    expect(shouldWriteCacheData(undefined)).toBe(false);
    expect(shouldWriteCacheData([])).toBe(true);
    expect(shouldWriteCacheData({ total: 0 })).toBe(true);
  });

  it("extracts order ids from CREATE/COMPLETE payloads", () => {
    expect(
      orderIdsFromSyncAction({
        payload: {
          localId: "LOCAL-1",
          input: { client_order_id: "LOCAL-1" },
        },
      }),
    ).toEqual(["LOCAL-1"]);
    expect(orderIdsFromSyncAction({ payload: { id: "abc" } })).toEqual(["abc"]);
    expect(orderIdsFromSyncAction({ payload: null })).toEqual([]);
  });
});
