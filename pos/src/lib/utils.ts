import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { BillLine, Order, OrderItem, OrderType, PaymentMethod } from "@/types";
import { isDealProduct } from "@/lib/deal-flavors";
import { isPizzaSizeLabel } from "@/lib/is-pizza";
import { weekendDiscount } from "@/lib/discount-rules";
import { storageKey } from "@/lib/shop";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(amount: number, currency = "Rs") {
  return `${currency} ${Number(amount || 0).toLocaleString("en-PK")}`;
}

/** Show stock in purchase units when conversion is available (same rules as admin). */
export function formatStock(
  qty: number,
  unit: string,
  purchaseUnit?: string,
  unitsPerPurchase?: number,
) {
  const u = (unit || "").toLowerCase();
  const pu = (purchaseUnit || "").toLowerCase();
  const upp = Number(unitsPerPurchase || 0);
  if (upp > 1 && (u === "g" || u === "ml") && qty >= upp) {
    const converted = qty / upp;
    const label = purchaseUnit || (u === "g" ? "KG" : "L");
    return `${converted.toLocaleString("en-PK", { maximumFractionDigits: 2 })} ${label}`;
  }
  if ((u === "g" || u === "ml") && Math.abs(qty) >= 1000) {
    return `${(qty / 1000).toLocaleString("en-PK", { maximumFractionDigits: 2 })} ${u === "g" ? "KG" : "L"}`;
  }
  if (pu === "carton" && upp > 1 && Math.abs(qty) >= upp) {
    return `${(qty / upp).toLocaleString("en-PK", { maximumFractionDigits: 1 })} ${purchaseUnit}`;
  }
  return `${Number(qty || 0).toLocaleString("en-PK")} ${unit || ""}`.trim();
}

/** True when JWT is missing, malformed, or past its exp claim. */
export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  const parts = token.split(".");
  if (parts.length !== 3) return true;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (typeof payload.exp !== "number") return true;
    return Math.floor(Date.now() / 1000) >= payload.exp - 10;
  } catch {
    return true;
  }
}

/** How long a previously-logged-in cashier may keep using POS offline after JWT exp. */
export const OFFLINE_SESSION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/** True when IndexedDB session can unlock POS without a fresh internet login. */
export function isOfflineSessionValid(session: {
  token?: string;
  exp?: number | null;
  saved_at?: string;
} | null): boolean {
  if (!session?.token) return false;
  if (!session.exp || session.exp * 1000 > Date.now()) return true;
  if (!session.saved_at) return false;
  const saved = new Date(session.saved_at).getTime();
  if (Number.isNaN(saved)) return false;
  return Date.now() - saved < OFFLINE_SESSION_GRACE_MS;
}

/** Deterministic walk-in location seeded by importmenu. */
export const WALKIN_LOCATION_ID = "50000000-0000-4000-8000-000000000000";

export function formatDateTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-PK", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function calcSubtotal(items: BillLine[]) {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

export function calcCodFee(
  method: PaymentMethod,
  fee: number,
) {
  return method === "cod" ? fee : 0;
}

export function calcGrandTotal(
  subtotal: number,
  deliveryCharge: number,
  codFee: number,
  discount = 0,
) {
  return Math.max(0, subtotal - discount) + deliveryCharge + codFee;
}

/**
 * Recalculate subtotal / discount / grand_total from line items.
 * Prevents stale totals after edit (items updated, money fields left behind).
 */
export function recomputeOrderMoney(order: Order): Order {
  const items = order.items || [];
  const subtotal = items.reduce(
    (sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0),
    0,
  );
  // Pin promo rules to the order day — reprint/edit after midnight must not
  // strip Friday/Sunday discount using "today".
  const promoDate = order.created_at
    ? new Date(order.created_at)
    : new Date();
  const discount = weekendDiscount(
    items.map((i) => ({
      product_name:
        (i as { product_name?: string }).product_name || i.product?.name,
      price: Number(i.price) || 0,
      quantity: Number(i.quantity) || 0,
      is_deal: i.product
        ? isDealProduct(i.product)
        : (i as { is_deal?: boolean }).is_deal,
    })),
    Number.isNaN(promoDate.getTime()) ? new Date() : promoDate,
  );
  const delivery_charge = Number(order.delivery_charge) || 0;
  const cash_on_delivery_fee = Number(order.cash_on_delivery_fee) || 0;
  const grand_total = calcGrandTotal(
    subtotal,
    delivery_charge,
    cash_on_delivery_fee,
    discount,
  );
  return {
    ...order,
    subtotal,
    discount,
    delivery_charge,
    cash_on_delivery_fee,
    grand_total,
  };
}

export function makeLineKey(
  productId: string,
  sizeId: string,
  instructions?: string,
  price?: number,
) {
  const note = (instructions || "").trim();
  const base = note
    ? `${productId}__${sizeId}__${note}`
    : `${productId}__${sizeId}`;
  if (typeof price === "number" && price > 0) {
    return `${base}__p${price}`;
  }
  return base;
}

export const PAYMENT_METHODS: {
  id: PaymentMethod;
  label: string;
}[] = [
  { id: "cash", label: "Cash" },
  { id: "easypaisa", label: "EasyPaisa" },
  { id: "jazzcash", label: "JazzCash" },
  { id: "card", label: "Card" },
  { id: "cod", label: "Cash On Delivery" },
];

/** Walk-in: counter payments only. Phone/website: no in-store cash. */
export function paymentsForOrderType(orderType: OrderType) {
  if (orderType === "walkin") {
    return PAYMENT_METHODS.filter(
      (m) => m.id === "cash" || m.id === "easypaisa" || m.id === "jazzcash",
    );
  }
  return PAYMENT_METHODS.filter((m) => m.id !== "cash");
}

export function defaultPaymentForOrderType(orderType: OrderType): PaymentMethod {
  return paymentsForOrderType(orderType)[0]?.id ?? "cash";
}

/** POS staff create walk-in / phone only; website orders arrive from the website. */
export const ORDER_TYPES = [
  { id: "walkin" as const, label: "Walk-in" },
  { id: "phone" as const, label: "Phone Order" },
];

export const TOKEN_KEY = storageKey("pos_token");
export const LAST_RECEIPT_KEY = storageKey("pos_last_receipt");

// ---------------------------------------------------------------------------
// Pakistani mobile number helpers
//
// Valid format: 11 digits starting with "03" (e.g. 0300-1234567).
// We also accept common input variants and normalise them to 03XXXXXXXXX:
//   +923001234567 / 923001234567 / 3001234567 -> 03001234567
// ---------------------------------------------------------------------------

/** Strip everything except digits, converting +92/92 prefixes to a leading 0. */
export function normalizePkPhone(raw: string): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("92")) {
    digits = "0" + digits.slice(2);
  } else if (digits.length === 10 && digits.startsWith("3")) {
    // 3001234567 -> 03001234567
    digits = "0" + digits;
  }
  return digits.slice(0, 11);
}

/** A valid PK mobile is exactly 11 digits and begins with 03. */
export function isValidPkPhone(raw: string): boolean {
  return /^03\d{9}$/.test(normalizePkPhone(raw));
}

/**
 * Format for display/input as the user types: 03XX-XXXXXXX.
 * Keeps partial input usable (no dash until we have more than 4 digits).
 */
export function formatPkPhone(raw: string): string {
  const digits = normalizePkPhone(raw);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

function orderItemDisplayName(
  item: OrderItem,
  nameById?: Map<string, string>,
): string {
  const nested = item.product?.name?.trim();
  const flat = item.product_name?.trim();
  const mapped = nameById?.get(item.product_id);
  const name = nested || flat || mapped || "Item";
  const size =
    item.product_size?.size?.trim() ||
    item.size?.trim() ||
    "";
  return isPizzaSizeLabel(size) ? `${name} (${size})` : name;
}

/**
 * Short product list for History / lists.
 * Caps length so long carts stay readable without heavy UI.
 */
export function formatOrderItemsSummary(
  order: Order,
  nameById?: Map<string, string>,
  maxParts = 5,
): string {
  const items = order.items || [];
  if (!items.length) return "No items";

  const parts = items.map((item) => {
    const label = orderItemDisplayName(item, nameById);
    return item.quantity > 1 ? `${item.quantity}x ${label}` : label;
  });

  if (parts.length <= maxParts) return parts.join(", ");
  const shown = parts.slice(0, maxParts).join(", ");
  return `${shown} +${parts.length - maxParts} more`;
}
