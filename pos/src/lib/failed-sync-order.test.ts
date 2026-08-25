import { describe, expect, it } from "vitest";
import { resolveFailedSyncOrder } from "@/lib/failed-sync-order";
import type { Order } from "@/types";

function order(partial: Partial<Order> & Pick<Order, "id">): Order {
  return {
    order_number: partial.order_number || `ORD-${partial.id}`,
    created_at: partial.created_at || "2026-08-25T10:00:00+05:00",
    updated_at: partial.created_at || "2026-08-25T10:00:00+05:00",
    customer_name: partial.customer_name || "Walk-in Customer",
    phone: "0000000000",
    address: "In Store",
    location_id: "loc",
    delivery_charge: 0,
    cash_on_delivery_fee: 0,
    payment_method: "cash",
    order_status: "COMPLETED",
    order_type: "walkin",
    order_notes: "",
    subtotal: partial.grand_total || 1500,
    discount: 0,
    grand_total: partial.grand_total || 1500,
    items: partial.items || [
      {
        id: "oi-1",
        created_at: "",
        updated_at: "",
        order_id: partial.id,
        product_id: "p1",
        product_size_id: "s1",
        quantity: 2,
        price: 750,
        special_instructions: "",
        product_name: "Chicken Pizza",
        size: "Large",
      },
    ],
    ...partial,
  };
}

describe("resolveFailedSyncOrder", () => {
  it("loads details from the linked local order for COMPLETE_ORDER", () => {
    const local = order({
      id: "local-1",
      client_order_id: "local-1",
      grand_total: 2200,
      customer_name: "Ali",
    });
    const summary = resolveFailedSyncOrder(
      { type: "COMPLETE_ORDER", payload: { id: "local-1" } },
      [local],
    );
    expect(summary?.customer_name).toBe("Ali");
    expect(summary?.grand_total).toBe(2200);
    expect(summary?.items_label).toContain("Chicken Pizza");
    expect(summary?.source).toBe("local_order");
  });

  it("falls back to CREATE_ORDER payload when local row is gone", () => {
    const summary = resolveFailedSyncOrder(
      {
        type: "CREATE_ORDER",
        payload: {
          localId: "gone",
          orderType: "walkin",
          input: {
            customer_name: "Walk-in Customer",
            grand_total: 900,
            items: [
              {
                product_id: "p1",
                product_size_id: "s1",
                quantity: 1,
                price: 900,
                product_name: "Fries",
              },
            ],
          },
        },
      },
      [],
    );
    expect(summary?.customer_name).toBe("Walk-in Customer");
    expect(summary?.grand_total).toBe(900);
    expect(summary?.items_label).toContain("Fries");
    expect(summary?.source).toBe("create_payload");
  });
});
