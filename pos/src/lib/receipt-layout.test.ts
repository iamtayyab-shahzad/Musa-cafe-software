import { describe, expect, it } from "vitest";
import {
  cashierReceiptLayout,
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

const settings = {
  id: "s",
  created_at: "",
  updated_at: "",
  restaurant_name: "MUSA CAFE",
  phone: "03095997786",
  currency: "Rs",
} as never;

describe("receipt layout", () => {
  it("empty settings use temporary cashier layout", () => {
    const parsed = parseReceiptLayout("");
    expect(parsed.customer.map((b) => b.type).slice(0, 5)).toEqual([
      "shop_name",
      "phone",
      "order_number",
      "table",
      "datetime",
    ]);
    expect(parsed.kitchen.map((b) => b.type).slice(0, 5)).toEqual([
      "shop_name",
      "phone",
      "order_number",
      "table_service",
      "datetime",
    ]);
    expect(parsed.customer.some((b) => b.type === "phone_datetime")).toBe(false);
  });

  it("Default preferred layout keeps phone with date/time on customer", () => {
    expect(
      defaultReceiptLayout().customer.some((b) => b.type === "phone_datetime"),
    ).toBe(true);
    expect(defaultReceiptLayout().kitchen.some((b) => b.type === "banner")).toBe(
      true,
    );
  });

  it("cashier print puts phone under shop name on both tickets", () => {
    const o = order();
    const kitchen = buildKitchenReceiptHtml(o, settings);
    const customer = buildCustomerReceiptHtml(o, settings);
    expect(kitchen.indexOf("MUSA CAFE")).toBeLessThan(kitchen.indexOf("03095997786"));
    expect(customer.indexOf("MUSA CAFE")).toBeLessThan(
      customer.indexOf("03095997786"),
    );
    expect(kitchen).toContain("Order #12");
    expect(customer).toContain("Order #12");
    expect(kitchen).toContain(" · ");
    expect(customer).toContain(" · ");
  });

  it("Default button layout restores preferred print", () => {
    const html = buildCustomerReceiptHtml(order(), {
      ...settings,
      receipt_layout: serializeReceiptLayout(defaultReceiptLayout()),
    } as never);
    expect(html).toContain("03095997786");
    expect(html).toMatch(/03095997786[\s\S]*? · /);
  });

  it("custom layout can hide phone", () => {
    const layout = cashierReceiptLayout();
    layout.customer = layout.customer.map((b) =>
      b.type === "phone" ? { ...b, visible: false } : b,
    );
    const html = buildCustomerReceiptHtml(order(), {
      ...settings,
      receipt_layout: serializeReceiptLayout(layout),
    } as never);
    expect(html).not.toContain("03095997786");
    expect(html).toContain("Order #12");
  });
});
