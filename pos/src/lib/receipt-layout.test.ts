import { describe, expect, it } from "vitest";
import {
  defaultReceiptLayout,
  parseReceiptLayout,
  serializeReceiptLayout,
} from "@/lib/receipt-layout";
import { buildCustomerReceiptHtml, buildKitchenReceiptHtml } from "@/lib/receipt";
import type { Order, OrderItem } from "@/types";

function item(): OrderItem {
  return {
    id: "i1",
    created_at: "",
    updated_at: "",
    order_id: "ord-1",
    product_id: "p1",
    product_size_id: "s1",
    quantity: 1,
    price: 300,
    product_name: "Mayo Fries Large",
  };
}

function order(): Order {
  return {
    id: "ord-1",
    created_at: "2026-09-03T16:03:50.000Z",
    updated_at: "2026-09-03T16:03:50.000Z",
    order_number: "MC-20260903-12",
    daily_number: 12,
    business_date: "2026-09-03",
    customer_name: "Walk-in Customer",
    phone: "0000000000",
    address: "In Store",
    location_id: "walkin",
    delivery_charge: 0,
    cash_on_delivery_fee: 0,
    payment_method: "cash",
    order_status: "COMPLETED",
    order_type: "walkin",
    order_notes: "SERVICE:DINE_IN | TABLE:3",
    subtotal: 300,
    grand_total: 300,
    items: [item()],
  };
}

describe("receipt layout", () => {
  it("empty settings use the current working default", () => {
    expect(parseReceiptLayout("").kitchen[0].type).toBe("shop_name");
    expect(parseReceiptLayout(null).customer.some((b) => b.type === "phone_datetime")).toBe(
      true,
    );
  });

  it("default print still shows order number, table, and thank you", () => {
    const o = order();
    const kitchen = buildKitchenReceiptHtml(o, null);
    const customer = buildCustomerReceiptHtml(o, {
      id: "s",
      created_at: "",
      updated_at: "",
      restaurant_name: "MUSA CAFE",
      phone: "03095997786",
      currency: "Rs",
    } as never);
    expect(kitchen).toContain("Order #12");
    expect(kitchen).toContain("TABLE 3,");
    expect(customer).toContain("Order #12");
    expect(customer).toContain("Thank you!");
    expect(customer).toContain("03095997786");
  });

  it("custom layout can hide phone and move thank you", () => {
    const layout = defaultReceiptLayout();
    layout.customer = layout.customer.map((b) =>
      b.type === "phone_datetime" ? { ...b, visible: false } : b,
    );
    const html = buildCustomerReceiptHtml(order(), {
      id: "s",
      created_at: "",
      updated_at: "",
      restaurant_name: "MUSA CAFE",
      phone: "03095997786",
      currency: "Rs",
      receipt_layout: serializeReceiptLayout(layout),
    } as never);
    expect(html).not.toContain("03095997786");
    expect(html).toContain("Order #12");
  });
});
