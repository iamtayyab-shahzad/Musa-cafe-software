import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status = 0) {
      super(message);
      this.status = status;
    }
  },
}));

import { apiFetch } from "@/lib/api-client";
import {
  clearForcedOffline,
  markUnreachable,
} from "@/lib/network";
import {
  closePosDbForTests,
  enqueueAction,
  listPendingActions,
  upsertLocalOrder,
} from "@/lib/offline-db";
import { getSyncState, runSync } from "@/lib/sync-engine";
import type { Order } from "@/types";

const DB_NAME = "musa-cafe-pos";
const apiFetchMock = vi.mocked(apiFetch);

function order(id: string): Order {
  return {
    id,
    client_order_id: id,
    order_number: `LOCAL-${id.slice(0, 8)}`,
    created_at: "2026-08-25T12:00:00+05:00",
    updated_at: "2026-08-25T12:00:00+05:00",
    customer_name: "Walk-in Customer",
    phone: "0000000000",
    address: "In Store",
    location_id: "50000000-0000-4000-8000-000000000000",
    delivery_charge: 0,
    cash_on_delivery_fee: 0,
    payment_method: "cash",
    order_status: "COMPLETED",
    order_type: "walkin",
    order_notes: "",
    subtotal: 1000,
    discount: 0,
    grand_total: 1000,
    items: [],
    sync_status: "pending_sync",
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
  apiFetchMock.mockReset();
  clearForcedOffline();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
});

afterEach(async () => {
  await deleteDb();
  clearForcedOffline();
});

describe("runSync batch resilience", () => {
  it("continues the batch after one network failure and keeps UI online", async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `ord-${i}`);
    for (const id of ids) {
      await upsertLocalOrder(order(id));
      await enqueueAction({
        type: "CREATE_ORDER",
        payload: {
          localId: id,
          orderType: "walkin",
          input: {
            client_order_id: id,
            customer_name: "Walk-in Customer",
            phone: "0000000000",
            address: "In Store",
            location_id: "50000000-0000-4000-8000-000000000000",
            payment_method: "cash",
            items: [
              {
                product_id: "11111111-1111-4111-8111-111111111111",
                product_size_id: "22222222-2222-4222-8222-222222222222",
                quantity: 1,
                price: 1000,
              },
            ],
          },
        },
      });
    }

    let calls = 0;
    apiFetchMock.mockImplementation(async (path: string) => {
      // Catalog pull after queue — return empty.
      if (typeof path === "string" && path.startsWith("/orders?")) return [];
      if (typeof path === "string" && path.startsWith("/inventory")) return [];
      if (typeof path === "string" && path.includes("discount-rules")) return [];

      calls += 1;
      if (calls === 2) {
        const err = new Error("Request timed out");
        (err as { status?: number }).status = 0;
        throw err;
      }
      return {
        id: `server-${calls}`,
        order_number: `KR-${calls}`,
        order_status: "PENDING",
        customer_name: "Walk-in Customer",
        phone: "0000000000",
        address: "In Store",
        location_id: "50000000-0000-4000-8000-000000000000",
        delivery_charge: 0,
        cash_on_delivery_fee: 0,
        payment_method: "cash",
        order_type: "walkin",
        order_notes: "",
        subtotal: 1000,
        discount: 0,
        grand_total: 1000,
        items: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    // Simulate prior cooldown from a cold-start timeout.
    markUnreachable();
    expect(getSyncState().online).toBe(true);

    await runSync("manual");

    const pending = await listPendingActions();
    // One CREATE left for retry; the other four should have synced.
    expect(pending).toHaveLength(1);
    expect(getSyncState().online).toBe(true);
    expect(navigator.onLine).toBe(true);
  });
});
