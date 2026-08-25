import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cacheGet,
  closePosDbForTests,
  deleteLocalOrder,
  healIndexedDb,
  listLocalOrders,
  putRawCacheRowForTests,
  upsertLocalOrder,
} from "@/lib/offline-db";
import type { Order } from "@/types";

const DB_NAME = "krunchies-pos";

function sale(
  partial: Partial<Order> & Pick<Order, "id" | "order_status">,
): Order {
  const now = "2026-08-17T14:00:00+05:00";
  return {
    order_number: `ORD-${partial.id}`,
    created_at: now,
    updated_at: now,
    customer_name: "Walk-in",
    phone: "0000000000",
    address: "",
    location_id: "loc",
    delivery_charge: 0,
    cash_on_delivery_fee: 0,
    payment_method: "cash",
    order_type: "walkin",
    order_notes: "",
    subtotal: 1500,
    discount: 0,
    grand_total: 1500,
    items: [],
    sync_status: "pending_sync",
    ...partial,
  };
}

async function deleteDb() {
  await closePosDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

/** Simulate a page reload: drop the in-memory IDB connection, then reopen. */
async function simulateReload() {
  await closePosDbForTests();
}

beforeEach(async () => {
  await deleteDb();
});

afterEach(async () => {
  await deleteDb();
});

describe("orders object store is the only source of truth", () => {
  it("walk-in complete survives reload without a cache.orders blob", async () => {
    await upsertLocalOrder(
      sale({ id: "walk-1", order_status: "PENDING" }),
    );
    await upsertLocalOrder(
      sale({ id: "walk-1", order_status: "COMPLETED" }),
    );
    expect(await cacheGet("orders")).toBeNull();

    await simulateReload();
    const after = await listLocalOrders();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("walk-1");
    expect(after[0].order_status).toBe("COMPLETED");
  });

  it("multiple offline completes survive reload from the orders store alone", async () => {
    await upsertLocalOrder(
      sale({ id: "off-1", order_status: "COMPLETED", grand_total: 800 }),
    );
    await upsertLocalOrder(
      sale({ id: "off-2", order_status: "COMPLETED", grand_total: 1200 }),
    );
    await upsertLocalOrder(
      sale({ id: "off-3", order_status: "COMPLETED", grand_total: 400 }),
    );
    expect(await cacheGet("orders")).toBeNull();

    await simulateReload();
    const after = await listLocalOrders();
    expect(after.map((o) => o.id).sort()).toEqual(["off-1", "off-2", "off-3"]);
    expect(after.every((o) => o.order_status === "COMPLETED")).toBe(true);
  });

  it("deleteLocalOrder removes from the orders store without writing cache.orders", async () => {
    await upsertLocalOrder(sale({ id: "gone", order_status: "PENDING" }));
    await deleteLocalOrder("gone");
    expect(await cacheGet("orders")).toBeNull();
    expect(await listLocalOrders()).toHaveLength(0);
  });

  it("heal still deletes a malformed cache.orders row and the app can list real orders", async () => {
    await upsertLocalOrder(
      sale({ id: "keep-me", order_status: "COMPLETED" }),
    );
    await putRawCacheRowForTests("orders", null);
    const report = await healIndexedDb();
    expect(
      report.removed.some((r) => r.store === "cache" && r.key === "orders"),
    ).toBe(true);
    await simulateReload();
    const listed = await listLocalOrders();
    expect(listed.some((o) => o.id === "keep-me")).toBe(true);
  });
});
