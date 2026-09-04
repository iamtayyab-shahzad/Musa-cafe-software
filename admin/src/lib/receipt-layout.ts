/** Block layout for 80mm thermal receipts. Default matches the current shop print. */

export type ReceiptAlign = "left" | "center" | "right";
export type ReceiptKind = "kitchen" | "customer";
export type ReceiptFontWeight = 400 | 600 | 700;

export type ReceiptBlockType =
  | "shop_name"
  | "order_number"
  | "table_service"
  | "table"
  | "banner"
  | "datetime"
  | "phone"
  | "phone_datetime"
  | "customer"
  | "payment"
  | "items"
  | "totals"
  | "item_count"
  | "notes"
  | "thank_you"
  | "website_qr"
  | "staff_notes"
  | "custom_text";

export type ReceiptBlock = {
  id: string;
  type: ReceiptBlockType;
  visible: boolean;
  fontSize: number;
  fontWeight: ReceiptFontWeight;
  align: ReceiptAlign;
  /** Used by custom_text, banner, thank_you */
  text?: string;
};

export type ReceiptLayout = {
  version: 1;
  kitchen: ReceiptBlock[];
  customer: ReceiptBlock[];
};

const ALLOWED: Record<ReceiptKind, ReceiptBlockType[]> = {
  kitchen: [
    "shop_name",
    "order_number",
    "table_service",
    "banner",
    "datetime",
    "phone",
    "customer",
    "items",
    "item_count",
    "notes",
    "staff_notes",
    "thank_you",
    "custom_text",
  ],
  customer: [
    "shop_name",
    "order_number",
    "table",
    "phone_datetime",
    "phone",
    "datetime",
    "customer",
    "payment",
    "items",
    "totals",
    "notes",
    "thank_you",
    "website_qr",
    "staff_notes",
    "custom_text",
  ],
};

export const RECEIPT_BLOCK_LABELS: Record<ReceiptBlockType, string> = {
  shop_name: "Shop name",
  order_number: "Order number",
  table_service: "Table + dine in / parcel",
  table: "Table number",
  banner: "Kitchen banner",
  datetime: "Date & time",
  phone: "Restaurant phone",
  phone_datetime: "Phone, date & time",
  customer: "Customer details",
  payment: "Payment method",
  items: "Item list",
  totals: "Totals",
  item_count: "Item / qty count",
  notes: "Order notes",
  thank_you: "Thank you line",
  website_qr: "Website QR",
  staff_notes: "Staff notes space",
  custom_text: "Custom text",
};

function block(
  id: string,
  type: ReceiptBlockType,
  extras: Partial<ReceiptBlock> = {},
): ReceiptBlock {
  return {
    id,
    type,
    visible: extras.visible ?? true,
    fontSize: extras.fontSize ?? 13,
    fontWeight: extras.fontWeight ?? 400,
    align: extras.align ?? "left",
    text: extras.text,
  };
}

/**
 * Your preferred layout (kitchen + customer as they print well today).
 * Admin "Default" always restores this.
 */
export function defaultReceiptLayout(): ReceiptLayout {
  return {
    version: 1,
    kitchen: [
      block("k-shop", "shop_name", {
        fontSize: 15,
        fontWeight: 600,
        align: "center",
      }),
      block("k-order", "order_number", {
        fontSize: 15,
        fontWeight: 700,
        align: "center",
      }),
      block("k-table", "table_service", {
        fontSize: 15,
        fontWeight: 700,
        align: "center",
      }),
      block("k-banner", "banner", {
        fontSize: 13,
        fontWeight: 400,
        align: "center",
        text: "* Kitchen Order Ticket *",
      }),
      block("k-when", "datetime", {
        fontSize: 12,
        fontWeight: 400,
        align: "left",
      }),
      block("k-cust", "customer", {
        fontSize: 12,
        fontWeight: 400,
        align: "left",
      }),
      block("k-items", "items", { fontSize: 13, fontWeight: 400, align: "left" }),
      block("k-count", "item_count", {
        fontSize: 12,
        fontWeight: 400,
        align: "left",
      }),
      block("k-notes", "notes", { fontSize: 12, fontWeight: 400, align: "left" }),
      block("k-staff", "staff_notes", {
        fontSize: 11,
        fontWeight: 400,
        align: "left",
      }),
    ],
    customer: [
      block("c-shop", "shop_name", {
        fontSize: 15,
        fontWeight: 600,
        align: "center",
      }),
      block("c-order", "order_number", {
        fontSize: 15,
        fontWeight: 700,
        align: "center",
      }),
      block("c-table", "table", {
        fontSize: 15,
        fontWeight: 700,
        align: "center",
      }),
      block("c-meta", "phone_datetime", {
        fontSize: 11,
        fontWeight: 400,
        align: "center",
      }),
      block("c-cust", "customer", {
        fontSize: 12,
        fontWeight: 400,
        align: "left",
      }),
      block("c-pay", "payment", {
        fontSize: 12,
        fontWeight: 400,
        align: "left",
      }),
      block("c-items", "items", { fontSize: 13, fontWeight: 400, align: "left" }),
      block("c-tot", "totals", { fontSize: 12, fontWeight: 400, align: "left" }),
      block("c-notes", "notes", { fontSize: 12, fontWeight: 400, align: "left" }),
      block("c-thanks", "thank_you", {
        fontSize: 12,
        fontWeight: 400,
        align: "center",
        text: "Thank you!",
      }),
      block("c-qr", "website_qr", {
        fontSize: 11,
        fontWeight: 400,
        align: "center",
      }),
      block("c-staff", "staff_notes", {
        fontSize: 11,
        fontWeight: 400,
        align: "left",
      }),
    ],
  };
}

/**
 * Temporary cashier preference: phone under shop name, date/time stay in the
 * meta place, kitchen + customer share the same header style.
 * Used while receipt_layout is empty; click Default to restore preferred print.
 */
export function cashierReceiptLayout(): ReceiptLayout {
  return {
    version: 1,
    kitchen: [
      block("k-shop", "shop_name", {
        fontSize: 15,
        fontWeight: 600,
        align: "center",
      }),
      block("k-phone", "phone", {
        fontSize: 11,
        fontWeight: 400,
        align: "center",
      }),
      block("k-order", "order_number", {
        fontSize: 15,
        fontWeight: 700,
        align: "center",
      }),
      block("k-table", "table_service", {
        fontSize: 15,
        fontWeight: 700,
        align: "center",
      }),
      block("k-when", "datetime", {
        fontSize: 11,
        fontWeight: 400,
        align: "center",
      }),
      block("k-cust", "customer", {
        fontSize: 12,
        fontWeight: 400,
        align: "left",
      }),
      block("k-items", "items", { fontSize: 13, fontWeight: 400, align: "left" }),
      block("k-count", "item_count", {
        fontSize: 12,
        fontWeight: 400,
        align: "left",
      }),
      block("k-notes", "notes", { fontSize: 12, fontWeight: 400, align: "left" }),
      block("k-thanks", "thank_you", {
        fontSize: 12,
        fontWeight: 400,
        align: "center",
        text: "Thank you!",
      }),
      block("k-staff", "staff_notes", {
        fontSize: 11,
        fontWeight: 400,
        align: "left",
      }),
    ],
    customer: [
      block("c-shop", "shop_name", {
        fontSize: 15,
        fontWeight: 600,
        align: "center",
      }),
      block("c-phone", "phone", {
        fontSize: 11,
        fontWeight: 400,
        align: "center",
      }),
      block("c-order", "order_number", {
        fontSize: 15,
        fontWeight: 700,
        align: "center",
      }),
      block("c-table", "table", {
        fontSize: 15,
        fontWeight: 700,
        align: "center",
      }),
      block("c-when", "datetime", {
        fontSize: 11,
        fontWeight: 400,
        align: "center",
      }),
      block("c-cust", "customer", {
        fontSize: 12,
        fontWeight: 400,
        align: "left",
      }),
      block("c-pay", "payment", {
        fontSize: 12,
        fontWeight: 400,
        align: "left",
      }),
      block("c-items", "items", { fontSize: 13, fontWeight: 400, align: "left" }),
      block("c-tot", "totals", { fontSize: 12, fontWeight: 400, align: "left" }),
      block("c-notes", "notes", { fontSize: 12, fontWeight: 400, align: "left" }),
      block("c-thanks", "thank_you", {
        fontSize: 12,
        fontWeight: 400,
        align: "center",
        text: "Thank you!",
      }),
      block("c-qr", "website_qr", {
        fontSize: 11,
        fontWeight: 400,
        align: "center",
      }),
      block("c-staff", "staff_notes", {
        fontSize: 11,
        fontWeight: 400,
        align: "left",
      }),
    ],
  };
}

const TYPES = new Set<ReceiptBlockType>([
  "shop_name",
  "order_number",
  "table_service",
  "table",
  "banner",
  "datetime",
  "phone",
  "phone_datetime",
  "customer",
  "payment",
  "items",
  "totals",
  "item_count",
  "notes",
  "thank_you",
  "website_qr",
  "staff_notes",
  "custom_text",
]);

function clampSize(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 13;
  return Math.min(28, Math.max(8, Math.round(v)));
}

function clampWeight(n: unknown): ReceiptFontWeight {
  if (n === 700 || n === 600 || n === 400) return n;
  if (n === true) return 700;
  return 400;
}

function clampAlign(v: unknown): ReceiptAlign {
  if (v === "left" || v === "center" || v === "right") return v;
  return "left";
}

function sanitizeBlock(
  raw: unknown,
  kind: ReceiptKind,
  index: number,
): ReceiptBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const type = row.type as ReceiptBlockType;
  if (!TYPES.has(type)) return null;
  if (!ALLOWED[kind].includes(type)) return null;
  const id =
    typeof row.id === "string" && row.id.trim()
      ? row.id.trim().slice(0, 40)
      : `${kind}-${index}-${type}`;
  const text =
    typeof row.text === "string" ? row.text.slice(0, 120) : undefined;
  return {
    id,
    type,
    visible: row.visible !== false,
    fontSize: clampSize(row.fontSize),
    fontWeight: clampWeight(row.fontWeight ?? row.bold),
    align: clampAlign(row.align),
    text,
  };
}

function ensureItems(blocks: ReceiptBlock[], kind: ReceiptKind): ReceiptBlock[] {
  const next = [...blocks];
  if (!next.some((b) => b.type === "items")) {
    next.push(
      block(`${kind}-items-req`, "items", {
        fontSize: 13,
        fontWeight: 400,
        align: "left",
      }),
    );
  }
  if (kind === "customer" && !next.some((b) => b.type === "totals")) {
    next.push(
      block("c-tot-req", "totals", {
        fontSize: 12,
        fontWeight: 400,
        align: "left",
      }),
    );
  }
  return next;
}

function sanitizeList(raw: unknown, kind: ReceiptKind): ReceiptBlock[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return defaultReceiptLayout()[kind];
  }
  const cleaned = raw
    .slice(0, 24)
    .map((row, i) => sanitizeBlock(row, kind, i))
    .filter((b): b is ReceiptBlock => Boolean(b));
  if (!cleaned.length) return defaultReceiptLayout()[kind];
  return ensureItems(cleaned, kind);
}

export function parseReceiptLayout(raw: unknown): ReceiptLayout {
  // Empty = temporary cashier layout. Saved Default JSON restores preferred print.
  if (raw == null || raw === "") return cashierReceiptLayout();
  let value: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return cashierReceiptLayout();
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      return cashierReceiptLayout();
    }
  }
  if (!value || typeof value !== "object") return cashierReceiptLayout();
  const obj = value as Record<string, unknown>;
  return {
    version: 1,
    kitchen: sanitizeList(obj.kitchen, "kitchen"),
    customer: sanitizeList(obj.customer, "customer"),
  };
}

export function serializeReceiptLayout(layout: ReceiptLayout): string {
  return JSON.stringify({
    version: 1,
    kitchen: sanitizeList(layout.kitchen, "kitchen"),
    customer: sanitizeList(layout.customer, "customer"),
  });
}

export function layoutsEqual(a: ReceiptLayout, b: ReceiptLayout): boolean {
  return serializeReceiptLayout(a) === serializeReceiptLayout(b);
}

export function newCustomTextBlock(kind: ReceiptKind): ReceiptBlock {
  return block(`${kind}-custom-${Date.now().toString(36)}`, "custom_text", {
    fontSize: 12,
    fontWeight: 400,
    align: "center",
    text: "",
  });
}

export function addableBlockTypes(kind: ReceiptKind, current: ReceiptBlock[]): ReceiptBlockType[] {
  const used = new Set(current.map((b) => b.type));
  return ALLOWED[kind].filter((type) => {
    if (type === "custom_text") return true;
    return !used.has(type);
  });
}

export function makeBlock(kind: ReceiptKind, type: ReceiptBlockType): ReceiptBlock {
  const fromDefault = defaultReceiptLayout()[kind].find((b) => b.type === type);
  if (fromDefault) {
    return { ...fromDefault, id: `${kind}-${type}-${Date.now().toString(36)}` };
  }
  if (type === "custom_text") return newCustomTextBlock(kind);
  return block(`${kind}-${type}-${Date.now().toString(36)}`, type, {
    fontSize: 12,
    fontWeight: 400,
    align: "center",
  });
}

export function blockInlineStyle(block: ReceiptBlock): string {
  return `text-align:${block.align};font-size:${block.fontSize}px;font-weight:${block.fontWeight};`;
}
