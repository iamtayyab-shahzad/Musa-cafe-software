import { describe, expect, it } from "vitest";
import {
  buildCustomerReceiptHtml,
  buildKitchenReceiptHtml,
  buildOneClickReceiptsHtml,
  ensureReceiptItemNames,
} from "./receipt";
import { parseDealIncludedItems } from "./deal-flavors";
import {
  defaultReceiptLayout,
  serializeReceiptLayout,
} from "./receipt-layout";
import type { Order, OrderItem, Settings } from "../types";

/** Preferred Default layout (not temporary cashier mode). */
function preferredSettings(
  extra: Partial<Settings> = {},
): Settings {
  return {
    id: "settings",
    created_at: "",
    updated_at: "",
    restaurant_name: "Musa Cafe",
    phone: "",
    whatsapp: "",
    logo: "",
    opening_time: "",
    closing_time: "",
    cash_on_delivery_fee: 0,
    currency: "Rs",
    google_maps: "",
    facebook: "",
    instagram: "",
    receipt_layout: serializeReceiptLayout(defaultReceiptLayout()),
    ...extra,
  };
}

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
    const kitchen = buildKitchenReceiptHtml(order, preferredSettings());
    const customer = buildCustomerReceiptHtml(order, preferredSettings());
    expect(kitchen).toContain("TABLE 7, Dine In");
    expect(kitchen).not.toContain("Ticket No");
    expect(kitchen).not.toContain("Walk-in Customer");
    expect(kitchen).not.toMatch(/table-big">TABLE 7<\/div>[\s\S]*?service-big/);
    expect(customer).toContain("TABLE 7");
    expect(customer).toContain("table-line");
    expect(customer).not.toContain("table-big");
    expect(customer).not.toContain("Dine In");
    expect(customer).not.toContain("Order:");
    expect(customer).not.toContain("Walk-in Customer");
    expect(customer).not.toContain("Phone: 0000000000");
    expect(customer).not.toContain("Address: In Store");
    expect(customer).toContain("Musa Cafe");
    expect(customer).toContain("font-weight: 600");
    expect(customer).not.toContain("font-weight: 800");
    // Long item names wrap instead of clipping mid-word on narrow paper.
    expect(customer).toContain("white-space: normal");
    expect(customer).toContain("overflow-wrap: anywhere");
    // Date · time (and shop phone when settings present) on one meta line
    expect(customer).toMatch(/class="meta"[^>]*>[\s\S]*? · /);
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
    const kitchen = buildKitchenReceiptHtml(order, preferredSettings());
    const customer = buildCustomerReceiptHtml(order, preferredSettings());
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
    const html = buildOneClickReceiptsHtml(order, preferredSettings());
    expect(html).toContain("Kitchen Order Ticket");
    expect(html).toContain("TOTAL");
    expect(html).toContain('class="ticket"');
    expect(html).toContain("page-break-after: always");
    expect(html).toContain("Order #3");
    expect(html).toContain("TABLE 1");
  });

  it("cashier one-click prints two identical customer slips", () => {
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
    expect(html).not.toContain("Kitchen Order Ticket");
    expect(html).toContain("TOTAL");
    expect(html).toContain('class="ticket"');
    expect(html).toContain("Order #3");
    expect(html).toContain("TABLE 1");
    expect(html).not.toContain("Dine In");
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
    const kitchen = buildKitchenReceiptHtml(order, preferredSettings());
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
    const html = buildKitchenReceiptHtml(order, preferredSettings());
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
    const pizzaHtml = buildCustomerReceiptHtml(pizza, preferredSettings());
    const shakeHtml = buildCustomerReceiptHtml(shake, preferredSettings());
    expect(pizzaHtml).toContain("Chicken Tika (L)");
    expect(shakeHtml).toContain("Mango Shake");
    expect(shakeHtml).not.toContain("(Regular)");
  });

  it("lists items included in a deal on Default layout", () => {
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
    const kitchen = buildKitchenReceiptHtml(order, preferredSettings());
    expect(kitchen).toContain("1 Zinger Burger");
    expect(kitchen).toContain("5 Hot Wings");
    expect(kitchen).toContain("1 Regular Drink");
    const customer = buildCustomerReceiptHtml(order, preferredSettings());
    expect(customer).toContain("1 Zinger Burger");
    expect(customer).not.toContain("www.krunchies.pk");
    expect(customer).toContain("Musa Cafe");
    expect(customer).toContain("Staff notes:");
    expect(customer).toContain("font-weight: 600");
    expect(customer).not.toContain("font-weight: 800");
    expect(customer).not.toContain("Order:");
    expect(customer).not.toContain("Walk-in Customer");
  });

  it("cashier mode hides deal contents and matches kitchen to customer", () => {
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
    const kitchen = buildKitchenReceiptHtml(order, null);
    const customer = buildCustomerReceiptHtml(order, null);
    expect(kitchen).toContain("Deal 1");
    expect(customer).toContain("Deal 1");
    expect(kitchen).not.toContain("1 Zinger Burger");
    expect(customer).not.toContain("5 Hot Wings");
    expect(kitchen).toContain("TOTAL");
    expect(kitchen).toContain("Payment:");
    const body = (html: string) =>
      html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]?.trim() || "";
    expect(body(kitchen)).toBe(body(customer));
  });

  it("cashier simple bill: shop name, wrap names, no borders, subtotal only with discount", () => {
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
          price: 550,
          product_name: "Oven bakened Pasta with Extra Cheese Topping",
        },
      ]),
    );
    const customer = buildCustomerReceiptHtml(order, null);
    expect(customer).toContain("Musa Cafe &amp; Pizza Hut");
    expect(customer).toContain('class="cashier-simple"');
    expect(customer).toContain("white-space: normal");
    expect(customer).toContain("Oven bakened Pasta with Extra Cheese Topping");
    expect(customer).not.toContain(">Subtotal<");
    expect(customer).toContain("TOTAL");
    // No decorative boxes/lines on any slip.
    expect(customer).not.toMatch(/\.daily-line\s*\{[^}]*border:\s*1/);
    expect(customer).not.toMatch(/\.total\s*\{[^}]*border:\s*1/);
    expect(customer).not.toMatch(/tbody td\s*\{[^}]*border-bottom:/);

    const withDiscount = ensureReceiptItemNames({
      ...order,
      discount: 50,
      grand_total: 500,
    });
    const discounted = buildCustomerReceiptHtml(withDiscount, null);
    expect(discounted).toContain("Subtotal");
    expect(discounted).toContain("Discount");
  });

  it("phone orders show Phone Order after the daily number", () => {
    const order = ensureReceiptItemNames({
      ...baseOrder([
        {
          id: "i1",
          created_at: "",
          updated_at: "",
          order_id: "ord-1",
          product_id: "p1",
          product_size_id: "s1",
          quantity: 1,
          price: 550,
          product_name: "Oven bakened Pasta",
        },
      ]),
      order_type: "phone",
      daily_number: 4,
      customer_name: "Ali",
      phone: "03001234567",
      address: "Street 1",
    });
    const customer = buildCustomerReceiptHtml(order, null);
    const kitchen = buildKitchenReceiptHtml(order, null);
    expect(customer).toContain("Order #4 · Phone Order");
    expect(kitchen).toContain("Order #4 · Phone Order");
    expect(customer).not.toMatch(/\.daily-line\s*\{[^}]*border:\s*1/);
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
