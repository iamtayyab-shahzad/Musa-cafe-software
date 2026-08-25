import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cacheGet,
  cacheSet,
  closePosDbForTests,
  enqueueAction,
  healIndexedDb,
  listDeadActions,
  listLocalOrders,
  listPendingActions,
  markActionError,
  pruneCacheKeys,
  putRawCacheRowForTests,
  reviveDeadAction,
  upsertLocalOrder,
} from "@/lib/offline-db";
import { localTodaySales } from "@/lib/local-sales";
import type { Order } from "@/types";

const DB_NAME = "krunchies-pos";

function sale(partial: Partial<Order> & Pick<Order, "id">): Order {
  const now = "2026-08-15T12:00:00+05:00";
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
    subtotal: 1800,
    discount: 0,
    grand_total: 1800,
    order_status: "COMPLETED",
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

beforeEach(async () => {
  await deleteDb();
});

afterEach(async () => {
  await deleteDb();
});

describe("IndexedDB null cache row (production crash)", () => {
  it("heal deletes a null orders cache row; prune and sales still work", async () => {
    const order = sale({ id: "ticket-1" });
    await upsertLocalOrder(order);

    // Reproduce the shop PC: cache "orders" is a row with data: null.
    await putRawCacheRowForTests("orders", null);
    expect(await cacheGet("orders")).toBeNull();

    const report = await healIndexedDb();
    expect(report.removed.some((r) => r.store === "cache" && r.key === "orders")).toBe(
      true,
    );

    await expect(pruneCacheKeys([])).resolves.toBeUndefined();

    const listed = await listLocalOrders();
    expect(listed.some((o) => o.id === "ticket-1")).toBe(true);
    expect(
      localTodaySales(listed, new Date("2026-08-15T18:00:00+05:00")),
    ).toBe(1800);
  });

  it("pruneCacheKeys does not throw when cache contains a null-data orders row", async () => {
    await cacheSet("products", [{ id: "p1" }]);
    await putRawCacheRowForTests("orders", null);
    await expect(pruneCacheKeys([])).resolves.toBeUndefined();
  });
});

describe("dead COMPLETE_ORDER flips local ticket to Sync failed", () => {
  it("marks the matching local order sync_failed instead of leaving silent COMPLETED", async () => {
    const order = sale({ id: "complete-me", order_status: "COMPLETED" });
    await upsertLocalOrder(order);
    const queued = await enqueueAction({
      type: "COMPLETE_ORDER",
      payload: { id: "complete-me" },
    });
    await markActionError(queued.id, "Cannot read properties of null (reading 'id')", {
      attempts: 8,
      dead: true,
    });

    const after = await listLocalOrders();
    const row = after.find((o) => o.id === "complete-me");
    expect(row?.order_status).toBe("COMPLETED");
    expect(row?.sync_status).toBe("sync_failed");

    await reviveDeadAction(queued.id);
    const revived = (await listLocalOrders()).find((o) => o.id === "complete-me");
    expect(revived?.sync_status).toBe("pending_sync");
  });
});

describe("Retry all path for stuck CREATE/COMPLETE/CANCEL", () => {
  it("heal + revive returns 17 CREATE / 15 COMPLETE / 2 CANCEL to the pending queue", async () => {
    await putRawCacheRowForTests("orders", null);
    const makes = (type: "CREATE_ORDER" | "COMPLETE_ORDER" | "CANCEL_ORDER", n: number) =>
      Promise.all(
        Array.from({ length: n }, (_, i) =>
          enqueueAction({
            type,
            payload:
              type === "CREATE_ORDER"
                ? {
                    localId: `LOCAL-${type}-${i}`,
                    input: { client_order_id: `LOCAL-${type}-${i}`, items: [] },
                  }
                : { id: `id-${type}-${i}` },
          }).then((item) =>
            markActionError(item.id, "cache prune crashed", {
              attempts: 8,
              dead: true,
            }),
          ),
        ),
      );

    await makes("CREATE_ORDER", 17);
    await makes("COMPLETE_ORDER", 15);
    await makes("CANCEL_ORDER", 2);

    expect(await listDeadActions()).toHaveLength(34);
    expect(await listPendingActions()).toHaveLength(0);

    await healIndexedDb();
    await pruneCacheKeys([]);

    const dead = await listDeadActions();
    expect(dead).toHaveLength(34);
    for (const item of dead) await reviveDeadAction(item.id);

    const pending = await listPendingActions();
    const counts = pending.reduce<Record<string, number>>((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});
    expect(counts.CREATE_ORDER).toBe(17);
    expect(counts.COMPLETE_ORDER).toBe(15);
    expect(counts.CANCEL_ORDER).toBe(2);
    expect(await listDeadActions()).toHaveLength(0);
  });
});
