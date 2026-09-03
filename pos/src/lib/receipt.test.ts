import { describe, expect, it } from "vitest";
import {
  buildCustomerReceiptHtml,
  buildKitchenReceiptHtml,
  buildOneClickReceiptsHtml,
  ensureReceiptItemNames,
} from "./receipt";
import { parseDealIncludedItems } from "./deal-flavors";
import type { Order, OrderItem } from "../types";

function baseOrder(items: OrderItem[]): Order {
  return {
    id: "ord-1",
    created_at: "2026-07-30T10:00:00.000Z",
    updated_at: "2026-07-30T10:00:00.000Z",
    order_number: "LOCAL-TEST01",
    customer_name: "Walk-in Customer",
    phone: "0000000000",
    address: "In Store",
    location_id: "walkin",
    delivery_charge: 0,
    cash_on_delivery_fee: 0,
    payment_method: "cash",
    order_status: "COMPLETED",
    order_type: "walkin",
    order_notes: "",
    subtotal: 750,
    grand_total: 750,
    items,
  };
}

describe("receipt product names", () => {
  it("shows name when nested product is missing", () => {
    const order = ensureReceiptItemNames(
      baseOrder([
        {
          id: "i1",
          created_at: "",
          updated_at: "",
          order_id: "ord-1",
          product_id: "p1",
          product_size_id: "s1",
          quantity: 2,
          price: 375,
          product_name: "Tikka Roll",
          size: "Regular",
        },
      ]),
    );
    const html = buildCustomerReceiptHtml(order, {
      id: "settings",
      created_at: "",
      updated_at: "",
      restaurant_name: "Musa Cafe",
      currency: "Rs",
    } as never);
    expect(html).toContain("Tikka Roll");
    expect(html).not.toContain("(Regular)");
    expect(html).not.toMatch(/>\s*Item\s*\(/);
  });

  it("fills blank nested product from product map", () => {
    const map = new Map([["p1", "Chicken Fajita"]]);
    const order = ensureReceiptItemNames(
      baseOrder([
        {
          id: "i1",
          created_at: "",
          updated_at: "",
          order_id: "ord-1",
          product_id: "p1",
          product_size_id: "s1",
          quantity: 1,
          price: 999,
          product: {
            id: "p1",
            created_at: "",
            updated_at: "",
            category_id: "",
            name: "",
            description: "",
            image: "",
            featured: false,
            available: true,
            display_order: 0,
          },
        },
      ]),
      map,
    );
    expect(order.items?.[0]?.product?.name).toBe("Chicken Fajita");
    const html = buildCustomerReceiptHtml(order, null);
    expect(html).toContain("Chicken Fajita");
  });

  it("preserves stored discount (does not recompute money)", () => {
    const order = ensureReceiptItemNames(
      {
        ...baseOrder([
          {
            id: "i1",
            created_at: "",
            updated_at: "",
            order_id: "ord-1",
            product_id: "p1",
            product_size_id: "s1",
            quantity: 1,
            price: 2000,
            product_name: "Chicken Fajita",
          },
        ]),
        discount: 200,
        grand_total: 1800,
        subtotal: 2000,
      },
    );
    expect(order.discount).toBe(200);
    expect(order.grand_total).toBe(1800);
  });

  it("prints crust/toppings on customer receipt", () => {
    const order = ensureReceiptItemNames(
      baseOrder([
        {
          id: "i1",
          created_at: "",
          updated_at: "",
          order_id: "ord-1",
          product_id: "p1",
          product_size_id: "s1",
          quantity: 1,
          price: 999,
          special_instructions: "Crust: Thin | Toppings: Extra Cheese",
          product_name: "Chicken Fajita",
        },
      ]),
    );
    const html = buildCustomerReceiptHtml(order, null);
    expect(html).toContain("Crust: Thin");
    expect(html).toContain("Toppings: Extra Cheese");
  });
});

describe("kitchen ticket layout", () => {
  it("prints a large table number when TABLE is set", () => {
    const order = ensureReceiptItemNames(
      {
        ...baseOrder([
          {
            id: "i1",
            created_at: "",
            updated_at: "",
            order_id: "ord-1",
            product_id: "p1",
            product_size_id: "s1",
            quantity: 1,
            price: 100,
            product_name: "Zinger Burger",
          },
        ]),
        order_notes: "SERVICE:DINE_IN | TABLE:7",
      },
    );
    const kitchen = buildKitchenReceiptHtml(order);
    const customer = buildCustomerReceiptHtml(order, null);
    expect(kitchen).toContain("TABLE 7");
    expect(kitchen).toContain("Dine In");
    expect(kitchen).not.toContain("Ticket No");
    expect(kitchen).not.toContain("Walk-in Customer");
    expect(customer).toContain("TABLE 7");
    expect(customer).toContain("table-line");
    expect(customer).not.toContain("table-big");
    expect(customer).not.toContain("Dine In");
    expect(customer).not.toContain("Order:");
    expect(customer).not.toContain("Walk-in Customer");
    expect(customer).not.toContain("Phone: 0000000000");
    expect(customer).not.toContain("Address: In Store");
    expect(customer).toContain("Musa Cafe");
    // Date · time (and shop phone when settings present) on one meta line
    expect(customer).toMatch(/class="meta">[\s\S]*? · /);
  });

  it("prints daily order number on one line matching shop-name size", () => {
    const order = ensureReceiptItemNames(
      {
        ...baseOrder([
          {
            id: "i1",
            created_at: "",
            updated_at: "",
            order_id: "ord-1",
            product_id: "p1",
            product_size_id: "s1",
            quantity: 1,
            price: 100,
            product_name: "Zinger Burger",
          },
        ]),
        daily_number: 12,
        business_date: "2026-09-03",
        order_notes: "SERVICE:DINE_IN | TABLE:7",
      },
    );
    const kitchen = buildKitchenReceiptHtml(order);
    const customer = buildCustomerReceiptHtml(order, null);
    expect(kitchen).toContain("Order #12");
    expect(kitchen).toContain("daily-big");
    expect(kitchen).not.toContain('<span class="lbl">ORDER</span>');
    expect(customer).toContain("Order #12");
    expect(customer).toContain("daily-line");
    expect(customer).not.toContain('<span class="lbl">ORDER</span>');
  });

  it("builds one-click kitchen+customer in a single document", () => {
    const order = ensureReceiptItemNames(
      {
        ...baseOrder([
          {
            id: "i1",
            created_at: "",
            updated_at: "",
            order_id: "ord-1",
            product_id: "p1",
            product_size_id: "s1",
            quantity: 1,
            price: 100,
            product_name: "Zinger Burger",
          },
        ]),
        daily_number: 3,
        order_notes: "SERVICE:DINE_IN | TABLE:1",
      },
    );
    const html = buildOneClickReceiptsHtml(order, null);
    expect(html).toContain("Kitchen Order Ticket");
    expect(html).toContain("TOTAL");
    expect(html).toContain('class="ticket"');
    expect(html).toContain("page-break-after: always");
    expect(html).toContain("Order #3");
    expect(html).toContain("TABLE 1");
  });

  it("prints Parcel for walk-in parcel service mode", () => {
    const order = ensureReceiptItemNames(
      {
        ...baseOrder([
          {
            id: "i1",
            created_at: "",
            updated_at: "",
            order_id: "ord-1",
            product_id: "p1",
            product_size_id: "s1",
            quantity: 1,
            price: 100,
            product_name: "Zinger Burger",
          },
        ]),
        order_notes: "SERVICE:PARCEL",
      },
    );
    const kitchen = buildKitchenReceiptHtml(order);
    expect(kitchen).toContain("Parcel");
    expect(kitchen).not.toContain("TABLE ");
  });

  it("puts quantity on the right and uses normal weight", () => {
    const order = ensureReceiptItemNames(
      baseOrder([
        {
          id: "i1",
          created_at: "",
          updated_at: "",
          order_id: "ord-1",
          product_id: "p1",
          product_size_id: "s1",
          quantity: 4,
          price: 375,
          product_name: "TIKKA ROLL",
          size: "Regular",
        },
      ]),
    );
    const html = buildKitchenReceiptHtml(order);
    expect(html).toContain("Item");
    expect(html).toContain("Qty");
    expect(html).toMatch(
      /class="name">TIKKA ROLL<\/div>[\s\S]*?class="col-qty">4<\/td>/,
    );
    expect(html).toContain("Staff notes:");
    expect(html).toContain("write-space");
    expect(html).toContain("width: 62mm");
    expect(html).not.toMatch(/class="qty">4x/);
    expect(html).not.toContain("font-weight: 800");
    expect(html).not.toContain("www.krunchies.pk");
    expect(html).not.toContain("Regular");
  });

  it("prints pizza size S/M/L/XL but not shake Regular", () => {
    const pizza = ensureReceiptItemNames(
      baseOrder([
        {
          id: "i1",
          created_at: "",
          updated_at: "",
          order_id: "ord-1",
          product_id: "p1",
          product_size_id: "s1",
          quantity: 1,
          price: 1400,
          product_name: "Chicken Tika",
          size: "L",
        },
      ]),
    );
    const shake = ensureReceiptItemNames(
      baseOrder([
        {
          id: "i2",
          created_at: "",
          updated_at: "",
          order_id: "ord-1",
          product_id: "p2",
          product_size_id: "s2",
          quantity: 1,
          price: 200,
          product_name: "Mango Shake",
          size: "Regular",
        },
      ]),
    );
    const pizzaHtml = buildCustomerReceiptHtml(pizza, null);
    const shakeHtml = buildCustomerReceiptHtml(shake, null);
    expect(pizzaHtml).toContain("Chicken Tika (L)");
    expect(shakeHtml).toContain("Mango Shake");
    expect(shakeHtml).not.toContain("(Regular)");
  });

  it("lists items included in a deal", () => {
    const order = ensureReceiptItemNames(
      baseOrder([
        {
          id: "i1",
          created_at: "",
          updated_at: "",
          order_id: "ord-1",
          product_id: "20000000-0000-4000-8000-000000000090",
          product_size_id: "s1",
          quantity: 1,
          price: 699,
          product_name: "Deal 1",
          product_description:
            "1 Zinger Burger, 5 Hot Wings and 1 Regular Drink.",
          size: "Deal",
        },
      ]),
    );
    const kitchen = buildKitchenReceiptHtml(order);
    expect(kitchen).toContain("1 Zinger Burger");
    expect(kitchen).toContain("5 Hot Wings");
    expect(kitchen).toContain("1 Regular Drink");
    const customer = buildCustomerReceiptHtml(order, null);
    expect(customer).toContain("1 Zinger Burger");
    expect(customer).not.toContain("www.krunchies.pk");
    expect(customer).toContain("Musa Cafe");
    expect(customer).toContain("Staff notes:");
    expect(customer).toContain("font-weight: 800"); // shop name
    expect(customer).not.toContain("Order:");
    expect(customer).not.toContain("Walk-in Customer");
  });
});

describe("parseDealIncludedItems", () => {
  it("splits flyer deal descriptions for the cook", () => {
    expect(
      parseDealIncludedItems(
        "1 Large Pizza, 2 Zinger Burgers, 1 Masala Fries and 1.5 L Drink.",
      ),
    ).toEqual([
      "1 Large Pizza",
      "2 Zinger Burgers",
      "1 Masala Fries",
      "1.5 L Drink",
    ]);
  });
});
