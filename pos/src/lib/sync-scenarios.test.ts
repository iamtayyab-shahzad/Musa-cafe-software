import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closePosDbForTests,
  enqueueAction,
  listLocalOrders,
  listLocalPendingOrders,
  listPendingActions,
  markActionSynced,
  mergeOrders,
  upsertLocalOrder,
} from "@/lib/offline-db";
import type { Order } from "@/types";

const DB_NAME = "krunchies-pos";

function order(
  partial: Partial<Order> &
    Pick<Order, "id" | "order_status" | "grand_total" | "created_at">,
): Order {
  return {
    order_number: partial.order_number || `ORD-${partial.id}`,
    updated_at: partial.created_at,
    customer_name: "Walk-in",
    phone: "0000000000",
    address: "",
    location_id: "loc",
    delivery_charge: 0,
    cash_on_delivery_fee: 0,
    payment_method: "cash",
    order_type: "walkin",
    order_notes: "",
    subtotal: partial.grand_total,
    discount: 0,
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

describe("manual scenarios (IDB-level, same paths sync uses)", () => {
  it("walk-in place + complete stays local then queue can sync", async () => {
    const id = "walkin-1";
    await upsertLocalOrder(
      order({
        id,
        client_order_id: id,
        order_status: "PENDING",
        grand_total: 2200,
        created_at: "2026-08-17T11:00:00+05:00",
        order_type: "walkin",
      }),
    );
    await enqueueAction({
      type: "CREATE_ORDER",
      payload: { localId: id, input: { client_order_id: id }, orderType: "walkin" },
    });
    await upsertLocalOrder(
      order({
        id,
        client_order_id: id,
        order_status: "COMPLETED",
        grand_total: 2200,
        created_at: "2026-08-17T11:00:00+05:00",
        order_type: "walkin",
        sync_status: "pending_sync",
      }),
    );
    await enqueueAction({
      type: "COMPLETE_ORDER",
      payload: { id },
    });

    const pending = await listPendingActions();
    expect(pending.map((a) => a.type).sort()).toEqual([
      "COMPLETE_ORDER",
      "CREATE_ORDER",
    ]);
    const local = (await listLocalOrders()).find((o) => o.id === id);
    expect(local?.order_status).toBe("COMPLETED");

    // Simulate successful cloud drain (sync engine markActionSynced path).
    for (const a of pending) await markActionSynced(a.id);
    expect(await listPendingActions()).toHaveLength(0);
  });

  it("website pending arrives via mergeOrders (incremental since pull)", async () => {
    await upsertLocalOrder(
      order({
        id: "old-synced",
        order_status: "COMPLETED",
        grand_total: 1000,
        created_at: "2026-08-16T10:00:00+05:00",
        sync_status: "synced",
      }),
    );

    // Incremental delta: only the new website pending ticket.
    await mergeOrders([
      order({
        id: "web-99",
        order_number: "KR-WEB99",
        order_status: "PENDING",
        grand_total: 3500,
        created_at: "2026-08-17T12:00:00+05:00",
        order_type: "website",
        customer_name: "Site Guest",
        phone: "03001234567",
        sync_status: "synced",
      }),
    ]);

    const pending = await listLocalPendingOrders();
    expect(pending.some((o) => o.id === "web-99")).toBe(true);
    // Older completed sale must still exist after incremental merge.
    expect((await listLocalOrders()).some((o) => o.id === "old-synced")).toBe(
      true,
    );
  });

  it("offline complete then online: queue survives and local stays COMPLETED", async () => {
    const id = "offline-complete-1";
    await upsertLocalOrder(
      order({
        id,
        client_order_id: id,
        order_status: "PENDING",
        grand_total: 1800,
        created_at: "2026-08-17T13:00:00+05:00",
      }),
    );
    // Offline: cashier completes — same as ordersApi.complete local path.
    await upsertLocalOrder(
      order({
        id,
        client_order_id: id,
        order_status: "COMPLETED",
        grand_total: 1800,
        created_at: "2026-08-17T13:00:00+05:00",
        sync_status: "pending_sync",
      }),
    );
    await enqueueAction({ type: "COMPLETE_ORDER", payload: { id } });

    expect(
      (await listLocalOrders()).find((o) => o.id === id)?.order_status,
    ).toBe("COMPLETED");
    expect(
      (await listPendingActions()).some((a) => a.type === "COMPLETE_ORDER"),
    ).toBe(true);

    // Online again: drain succeeds.
    const q = await listPendingActions();
    for (const a of q) await markActionSynced(a.id);
    expect(await listPendingActions()).toHaveLength(0);
    expect(
      (await listLocalOrders()).find((o) => o.id === id)?.order_status,
    ).toBe("COMPLETED");
  });
});
