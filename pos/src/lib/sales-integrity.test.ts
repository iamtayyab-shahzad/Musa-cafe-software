import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
  isPermanentSyncError,
  shouldCountSyncAttempt,
} from "@/lib/network";
import { preferEarlierCreatedAt } from "@/lib/order-identity";
import {
  localSalesForKarachiDay,
  localTodaySales,
  sumCompletedSalesInRange,
} from "@/lib/local-sales";
import type { Order } from "@/types";

function order(
  partial: Partial<Order> &
    Pick<Order, "id" | "order_status" | "grand_total" | "created_at">,
): Order {
  return {
    order_number: `ORD-${partial.id}`,
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
    ...partial,
  };
}

describe("sales integrity", () => {
  it("counts LOCAL + server twins of the same ticket once", () => {
    const rows = [
      order({
        id: "client-1",
        client_order_id: "client-1",
        order_number: "LOCAL-AAAA",
        order_status: "COMPLETED",
        grand_total: 74000,
        created_at: "2026-08-10T12:00:00+05:00",
      }),
      order({
        id: "server-1",
        client_order_id: "client-1",
        order_number: "KR-AAAA",
        order_status: "COMPLETED",
        grand_total: 74000,
        created_at: "2026-08-10T12:00:00+05:00",
      }),
    ];
    expect(
      localSalesForKarachiDay(rows, "2026-08-10").total,
    ).toBe(74000);
    expect(localSalesForKarachiDay(rows, "2026-08-10").orderCount).toBe(1);
  });

  it("does not treat previous days as today after a sync-time stamp", () => {
    // Original sale was 8 Aug; a buggy sync would rewrite created_at to 11 Aug.
    // With preferEarlierCreatedAt the till keeps 8 Aug.
    const original = "2026-08-08T18:00:00+05:00";
    const syncTime = "2026-08-11T10:00:00+05:00";
    const kept = preferEarlierCreatedAt(original, syncTime);
    const rows = [
      order({
        id: "server-1",
        client_order_id: "client-1",
        order_status: "COMPLETED",
        grand_total: 5000,
        created_at: kept,
      }),
    ];
    expect(localSalesForKarachiDay(rows, "2026-08-08").total).toBe(5000);
    expect(localSalesForKarachiDay(rows, "2026-08-11").total).toBe(0);
  });

  it("simulates 7 days: only that day's unique completed sales count as today", () => {
    const rows: Order[] = [];
    const days = [
      { ymd: "2026-08-04", n: 20, each: 500 },
      { ymd: "2026-08-05", n: 30, each: 500 },
      { ymd: "2026-08-06", n: 25, each: 500 },
      { ymd: "2026-08-07", n: 40, each: 500 },
      { ymd: "2026-08-08", n: 35, each: 500 },
      { ymd: "2026-08-09", n: 30, each: 500 },
    ];
    for (const day of days) {
      for (let i = 0; i < day.n; i++) {
        const client = `${day.ymd}-${i}`;
        rows.push(
          order({
            id: `local-${client}`,
            client_order_id: client,
            order_number: `LOCAL-${i}`,
            order_status: "COMPLETED",
            grand_total: day.each,
            created_at: `${day.ymd}T12:00:00+05:00`,
          }),
        );
        // After reconnect a server twin appears with a later created_at.
        rows.push(
          order({
            id: `server-${client}`,
            client_order_id: client,
            order_number: `KR-${i}`,
            order_status: "COMPLETED",
            grand_total: day.each,
            created_at: preferEarlierCreatedAt(
              `${day.ymd}T12:00:00+05:00`,
              "2026-08-10T09:00:00+05:00",
            ),
          }),
        );
      }
    }
    expect(localSalesForKarachiDay(rows, "2026-08-07")).toEqual({
      total: 40 * 500,
      orderCount: 40,
    });
    expect(localSalesForKarachiDay(rows, "2026-08-10").total).toBe(0);
    const now = new Date("2026-08-07T18:00:00+05:00");
    expect(localTodaySales(rows, now)).toBe(20000);
  });

  it("does not count pending or cancelled", () => {
    const { startMs, endMs } = {
      startMs: new Date("2026-08-10T00:00:00+05:00").getTime(),
      endMs: new Date("2026-08-11T00:00:00+05:00").getTime(),
    };
    const rows = [
      order({
        id: "p",
        order_status: "PENDING",
        grand_total: 9999,
        created_at: "2026-08-10T10:00:00+05:00",
      }),
      order({
        id: "c",
        order_status: "CANCELLED",
        grand_total: 8888,
        created_at: "2026-08-10T11:00:00+05:00",
      }),
    ];
    expect(sumCompletedSalesInRange(rows, startMs, endMs)).toBe(0);
  });
});

describe("sync attempt budget", () => {
  it("does not count network / 503 toward dead-letter", () => {
    expect(shouldCountSyncAttempt(new Error("Failed to fetch"))).toBe(false);
    expect(shouldCountSyncAttempt(new ApiError("timeout", 0))).toBe(false);
    expect(shouldCountSyncAttempt(new ApiError("unavailable", 503))).toBe(
      false,
    );
    expect(shouldCountSyncAttempt(new ApiError("unauthorized", 401))).toBe(
      false,
    );
  });

  it("404 complete is retryable, 400 validation is permanent", () => {
    expect(isPermanentSyncError(new ApiError("not found", 404))).toBe(false);
    expect(isPermanentSyncError(new ApiError("invalid product", 400))).toBe(
      true,
    );
  });
});
