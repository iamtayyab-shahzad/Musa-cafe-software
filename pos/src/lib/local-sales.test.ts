import { describe, expect, it } from "vitest";
import {
  isCompletedSale,
  karachiDayBoundsUtc,
  karachiYmd,
  localTodaySales,
  localWeeklySales,
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

describe("local sales for offline dashboard", () => {
  it("karachi day bounds cover one PKT calendar day", () => {
    const { startMs, endMs } = karachiDayBoundsUtc("2026-08-08");
    expect(endMs - startMs).toBe(24 * 60 * 60 * 1000);
    // Midday PKT is inside
    expect(
      new Date("2026-08-08T12:00:00+05:00").getTime(),
    ).toBeGreaterThanOrEqual(startMs);
    expect(new Date("2026-08-08T12:00:00+05:00").getTime()).toBeLessThan(
      endMs,
    );
  });

  it("sums only COMPLETED (not pending/cancelled)", () => {
    const day = "2026-08-08";
    const { startMs, endMs } = karachiDayBoundsUtc(day);
    const rows = [
      order({
        id: "1",
        order_status: "COMPLETED",
        grand_total: 1000,
        created_at: "2026-08-08T10:00:00+05:00",
      }),
      order({
        id: "2",
        order_status: "PENDING",
        grand_total: 5000,
        created_at: "2026-08-08T11:00:00+05:00",
      }),
      order({
        id: "3",
        order_status: "CANCELLED",
        grand_total: 2000,
        created_at: "2026-08-08T12:00:00+05:00",
      }),
      order({
        id: "4",
        order_status: "COMPLETED",
        grand_total: 350,
        created_at: "2026-08-08T15:00:00+05:00",
      }),
      order({
        id: "5",
        order_status: "COMPLETED",
        grand_total: 999,
        created_at: "2026-08-07T23:00:00+05:00", // yesterday
      }),
    ];
    expect(sumCompletedSalesInRange(rows, startMs, endMs)).toBe(1350);
    expect(isCompletedSale(rows[1])).toBe(false);
  });

  it("localTodaySales uses Karachi today", () => {
    const now = new Date("2026-08-08T18:30:00+05:00");
    expect(karachiYmd(now)).toBe("2026-08-08");
    const rows = [
      order({
        id: "a",
        order_status: "COMPLETED",
        grand_total: 800,
        created_at: "2026-08-08T09:00:00+05:00",
      }),
      order({
        id: "b",
        order_status: "PENDING",
        grand_total: 400,
        created_at: "2026-08-08T10:00:00+05:00",
      }),
    ];
    expect(localTodaySales(rows, now)).toBe(800);
  });

  it("localWeeklySales includes last 7 days rolling", () => {
    const now = new Date("2026-08-08T12:00:00+05:00");
    const rows = [
      order({
        id: "w1",
        order_status: "COMPLETED",
        grand_total: 100,
        created_at: "2026-08-07T12:00:00+05:00",
      }),
      order({
        id: "w2",
        order_status: "COMPLETED",
        grand_total: 200,
        created_at: "2026-08-01T12:00:00+05:00", // ~7 days earlier boundary
      }),
      order({
        id: "w3",
        order_status: "COMPLETED",
        grand_total: 50,
        created_at: "2026-07-31T12:00:00+05:00", // older than 7d
      }),
    ];
    const total = localWeeklySales(rows, now);
    expect(total).toBeGreaterThanOrEqual(100);
    expect(total).toBeLessThan(350); // excludes the oldest 50 for sure if outside window
  });

  it("one null/malformed row does not zero today's sales", () => {
    const now = new Date("2026-08-15T18:00:00+05:00");
    const rows = [
      null,
      undefined,
      order({
        id: "good",
        order_status: "COMPLETED",
        grand_total: 2500,
        created_at: "2026-08-15T12:00:00+05:00",
      }),
      { id: null, order_status: "COMPLETED", grand_total: 9999 },
    ] as unknown as Order[];
    expect(localTodaySales(rows, now)).toBe(2500);
  });
});
