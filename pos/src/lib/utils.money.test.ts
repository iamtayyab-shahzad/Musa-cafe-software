import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { recomputeOrderMoney } from "@/lib/utils";
import { setDiscountRulesCache } from "@/lib/discount-rules";
import type { Order } from "@/types";

function order(partial: Partial<Order>): Order {
  return {
    id: "o1",
    created_at: "2026-08-07T12:00:00.000Z", // Friday in Karachi (UTC+5)
    updated_at: "2026-08-07T12:00:00.000Z",
    order_number: "A-1",
    customer_name: "Test",
    phone: "03001234567",
    address: "",
    location_id: "loc",
    delivery_charge: 0,
    cash_on_delivery_fee: 0,
    payment_method: "cash",
    order_status: "COMPLETED",
    order_type: "walkin",
    order_notes: "",
    subtotal: 2000,
    discount: 0,
    grand_total: 2000,
    items: [
      {
        id: "i1",
        created_at: "",
        updated_at: "",
        order_id: "o1",
        product_id: "p1",
        product_size_id: "s1",
        quantity: 1,
        price: 2000,
        special_instructions: "",
        product_name: "Chicken Fajita",
      },
    ],
    sync_status: "synced",
    ...partial,
  };
}

describe("recomputeOrderMoney promo date", () => {
  beforeEach(() => {
    setDiscountRulesCache([
      {
        name: "Fri & Sun 10% off",
        active: true,
        percent: 10,
        min_subtotal: 1000,
        schedule_type: "weekdays",
        weekdays: [5, 0],
        exclude_deals: true,
      },
    ]);
  });
  afterEach(() => setDiscountRulesCache([]));

  it("keeps Friday promo discount when recomputed on a later day", () => {
    // Order created Friday 7 Aug 2026 Karachi; recompute must use created_at
    // not "today" so Monday reprint does not strip the 10% discount.
    const result = recomputeOrderMoney(order({}));
    expect(result.discount).toBe(200); // 10% of 2000
    expect(result.grand_total).toBe(1800);
  });

  it("does not apply promo for a Monday order", () => {
    const result = recomputeOrderMoney(
      order({
        created_at: "2026-08-03T12:00:00.000Z", // Monday Karachi
        updated_at: "2026-08-03T12:00:00.000Z",
      }),
    );
    expect(result.discount).toBe(0);
    expect(result.grand_total).toBe(2000);
  });
});
