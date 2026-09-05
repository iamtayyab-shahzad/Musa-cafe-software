import type { Order, OrderItem, Settings } from "@/types";
import { formatPrice } from "@/lib/utils";
import { parseDealIncludedItems } from "@/lib/deal-flavors";
import { isDealLineName } from "@/lib/discount-rules";
import { isPizzaSizeLabel } from "@/lib/is-pizza";
import { krunchiesProducts } from "@/data/krunchies";
import { publicSiteHost, shop } from "@/lib/shop";
import {
  blockInlineStyle,
  cashierReceiptLayout,
  layoutsEqual,
  parseReceiptLayout,
  type ReceiptBlock,
} from "@/lib/receipt-layout";

const bundledDescriptionByProductId = new Map(
  krunchiesProducts.map((p) => [p.id, p.description || ""]),
);

/** Thermal-safe website QR — only printed when a public domain is configured. */
const WEBSITE_QR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33" shape-rendering="crispEdges"><rect width="33" height="33" fill="#fff"/><rect x="4" y="4" width="7" height="1" fill="#000"/><rect x="12" y="4" width="1" height="1" fill="#000"/><rect x="15" y="4" width="2" height="1" fill="#000"/><rect x="22" y="4" width="7" height="1" fill="#000"/><rect x="4" y="5" width="1" height="1" fill="#000"/><rect x="10" y="5" width="1" height="1" fill="#000"/><rect x="13" y="5" width="4" height="1" fill="#000"/><rect x="18" y="5" width="3" height="1" fill="#000"/><rect x="22" y="5" width="1" height="1" fill="#000"/><rect x="28" y="5" width="1" height="1" fill="#000"/><rect x="4" y="6" width="1" height="1" fill="#000"/><rect x="6" y="6" width="3" height="1" fill="#000"/><rect x="10" y="6" width="1" height="1" fill="#000"/><rect x="13" y="6" width="1" height="1" fill="#000"/><rect x="17" y="6" width="1" height="1" fill="#000"/><rect x="19" y="6" width="1" height="1" fill="#000"/><rect x="22" y="6" width="1" height="1" fill="#000"/><rect x="24" y="6" width="3" height="1" fill="#000"/><rect x="28" y="6" width="1" height="1" fill="#000"/><rect x="4" y="7" width="1" height="1" fill="#000"/><rect x="6" y="7" width="3" height="1" fill="#000"/><rect x="10" y="7" width="1" height="1" fill="#000"/><rect x="12" y="7" width="2" height="1" fill="#000"/><rect x="15" y="7" width="2" height="1" fill="#000"/><rect x="18" y="7" width="1" height="1" fill="#000"/><rect x="22" y="7" width="1" height="1" fill="#000"/><rect x="24" y="7" width="3" height="1" fill="#000"/><rect x="28" y="7" width="1" height="1" fill="#000"/><rect x="4" y="8" width="1" height="1" fill="#000"/><rect x="6" y="8" width="3" height="1" fill="#000"/><rect x="10" y="8" width="1" height="1" fill="#000"/><rect x="13" y="8" width="4" height="1" fill="#000"/><rect x="18" y="8" width="1" height="1" fill="#000"/><rect x="22" y="8" width="1" height="1" fill="#000"/><rect x="24" y="8" width="3" height="1" fill="#000"/><rect x="28" y="8" width="1" height="1" fill="#000"/><rect x="4" y="9" width="1" height="1" fill="#000"/><rect x="10" y="9" width="1" height="1" fill="#000"/><rect x="16" y="9" width="2" height="1" fill="#000"/><rect x="19" y="9" width="2" height="1" fill="#000"/><rect x="22" y="9" width="1" height="1" fill="#000"/><rect x="28" y="9" width="1" height="1" fill="#000"/><rect x="4" y="10" width="7" height="1" fill="#000"/><rect x="12" y="10" width="1" height="1" fill="#000"/><rect x="14" y="10" width="1" height="1" fill="#000"/><rect x="16" y="10" width="1" height="1" fill="#000"/><rect x="18" y="10" width="1" height="1" fill="#000"/><rect x="20" y="10" width="1" height="1" fill="#000"/><rect x="22" y="10" width="7" height="1" fill="#000"/><rect x="14" y="11" width="7" height="1" fill="#000"/><rect x="6" y="12" width="1" height="1" fill="#000"/><rect x="8" y="12" width="3" height="1" fill="#000"/><rect x="12" y="12" width="1" height="1" fill="#000"/><rect x="15" y="12" width="2" height="1" fill="#000"/><rect x="18" y="12" width="4" height="1" fill="#000"/><rect x="25" y="12" width="1" height="1" fill="#000"/><rect x="28" y="12" width="1" height="1" fill="#000"/><rect x="4" y="13" width="2" height="1" fill="#000"/><rect x="7" y="13" width="2" height="1" fill="#000"/><rect x="13" y="13" width="3" height="1" fill="#000"/><rect x="17" y="13" width="4" height="1" fill="#000"/><rect x="22" y="13" width="3" height="1" fill="#000"/><rect x="27" y="13" width="2" height="1" fill="#000"/><rect x="6" y="14" width="1" height="1" fill="#000"/><rect x="8" y="14" width="1" height="1" fill="#000"/><rect x="10" y="14" width="2" height="1" fill="#000"/><rect x="14" y="14" width="1" height="1" fill="#000"/><rect x="19" y="14" width="1" height="1" fill="#000"/><rect x="21" y="14" width="2" height="1" fill="#000"/><rect x="24" y="14" width="5" height="1" fill="#000"/><rect x="4" y="15" width="4" height="1" fill="#000"/><rect x="11" y="15" width="1" height="1" fill="#000"/><rect x="13" y="15" width="3" height="1" fill="#000"/><rect x="17" y="15" width="1" height="1" fill="#000"/><rect x="19" y="15" width="2" height="1" fill="#000"/><rect x="23" y="15" width="2" height="1" fill="#000"/><rect x="27" y="15" width="2" height="1" fill="#000"/><rect x="5" y="16" width="1" height="1" fill="#000"/><rect x="10" y="16" width="1" height="1" fill="#000"/><rect x="18" y="16" width="3" height="1" fill="#000"/><rect x="26" y="16" width="1" height="1" fill="#000"/><rect x="8" y="17" width="1" height="1" fill="#000"/><rect x="11" y="17" width="3" height="1" fill="#000"/><rect x="16" y="17" width="4" height="1" fill="#000"/><rect x="23" y="17" width="2" height="1" fill="#000"/><rect x="27" y="17" width="2" height="1" fill="#000"/><rect x="4" y="18" width="1" height="1" fill="#000"/><rect x="7" y="18" width="2" height="1" fill="#000"/><rect x="10" y="18" width="1" height="1" fill="#000"/><rect x="12" y="18" width="1" height="1" fill="#000"/><rect x="14" y="18" width="2" height="1" fill="#000"/><rect x="17" y="18" width="2" height="1" fill="#000"/><rect x="20" y="18" width="2" height="1" fill="#000"/><rect x="23" y="18" width="1" height="1" fill="#000"/><rect x="5" y="19" width="1" height="1" fill="#000"/><rect x="7" y="19" width="1" height="1" fill="#000"/><rect x="9" y="19" width="1" height="1" fill="#000"/><rect x="11" y="19" width="2" height="1" fill="#000"/><rect x="15" y="19" width="1" height="1" fill="#000"/><rect x="17" y="19" width="1" height="1" fill="#000"/><rect x="21" y="19" width="1" height="1" fill="#000"/><rect x="23" y="19" width="3" height="1" fill="#000"/><rect x="4" y="20" width="1" height="1" fill="#000"/><rect x="6" y="20" width="1" height="1" fill="#000"/><rect x="10" y="20" width="1" height="1" fill="#000"/><rect x="13" y="20" width="1" height="1" fill="#000"/><rect x="15" y="20" width="1" height="1" fill="#000"/><rect x="17" y="20" width="1" height="1" fill="#000"/><rect x="20" y="20" width="6" height="1" fill="#000"/><rect x="28" y="20" width="1" height="1" fill="#000"/><rect x="12" y="21" width="2" height="1" fill="#000"/><rect x="15" y="21" width="1" height="1" fill="#000"/><rect x="17" y="21" width="1" height="1" fill="#000"/><rect x="20" y="21" width="1" height="1" fill="#000"/><rect x="24" y="21" width="1" height="1" fill="#000"/><rect x="26" y="21" width="1" height="1" fill="#000"/><rect x="28" y="21" width="1" height="1" fill="#000"/><rect x="4" y="22" width="7" height="1" fill="#000"/><rect x="14" y="22" width="1" height="1" fill="#000"/><rect x="16" y="22" width="2" height="1" fill="#000"/><rect x="19" y="22" width="2" height="1" fill="#000"/><rect x="22" y="22" width="1" height="1" fill="#000"/><rect x="24" y="22" width="3" height="1" fill="#000"/><rect x="28" y="22" width="1" height="1" fill="#000"/><rect x="4" y="23" width="1" height="1" fill="#000"/><rect x="10" y="23" width="1" height="1" fill="#000"/><rect x="12" y="23" width="2" height="1" fill="#000"/><rect x="15" y="23" width="1" height="1" fill="#000"/><rect x="17" y="23" width="2" height="1" fill="#000"/><rect x="20" y="23" width="1" height="1" fill="#000"/><rect x="24" y="23" width="1" height="1" fill="#000"/><rect x="26" y="23" width="3" height="1" fill="#000"/><rect x="4" y="24" width="1" height="1" fill="#000"/><rect x="6" y="24" width="3" height="1" fill="#000"/><rect x="10" y="24" width="1" height="1" fill="#000"/><rect x="12" y="24" width="1" height="1" fill="#000"/><rect x="14" y="24" width="13" height="1" fill="#000"/><rect x="4" y="25" width="1" height="1" fill="#000"/><rect x="6" y="25" width="3" height="1" fill="#000"/><rect x="10" y="25" width="1" height="1" fill="#000"/><rect x="13" y="25" width="1" height="1" fill="#000"/><rect x="16" y="25" width="1" height="1" fill="#000"/><rect x="19" y="25" width="1" height="1" fill="#000"/><rect x="23" y="25" width="3" height="1" fill="#000"/><rect x="27" y="25" width="1" height="1" fill="#000"/><rect x="4" y="26" width="1" height="1" fill="#000"/><rect x="6" y="26" width="3" height="1" fill="#000"/><rect x="10" y="26" width="1" height="1" fill="#000"/><rect x="12" y="26" width="7" height="1" fill="#000"/><rect x="21" y="26" width="2" height="1" fill="#000"/><rect x="25" y="26" width="1" height="1" fill="#000"/><rect x="28" y="26" width="1" height="1" fill="#000"/><rect x="4" y="27" width="1" height="1" fill="#000"/><rect x="10" y="27" width="1" height="1" fill="#000"/><rect x="14" y="27" width="1" height="1" fill="#000"/><rect x="17" y="27" width="5" height="1" fill="#000"/><rect x="24" y="27" width="5" height="1" fill="#000"/><rect x="4" y="28" width="7" height="1" fill="#000"/><rect x="17" y="28" width="7" height="1" fill="#000"/><rect x="25" y="28" width="2" height="1" fill="#000"/><rect x="28" y="28" width="1" height="1" fill="#000"/></svg>`;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function styledBlock(block: ReceiptBlock, className: string, inner: string) {
  return `<div class="${className}" style="${blockInlineStyle(block)}">${inner}</div>`;
}

/** Temporary cashier mode (empty layout / cashier preset). Default restores preferred print. */
function isCashierPrintMode(settings: Settings | null | undefined): boolean {
  return layoutsEqual(
    parseReceiptLayout(settings?.receipt_layout),
    cashierReceiptLayout(),
  );
}

function dealContentsHtml(item: OrderItem, showDetails: boolean) {
  if (!showDetails) return "";
  const name = itemName(item);
  const desc =
    item.product?.description ||
    (item as { product_description?: string }).product_description ||
    "";
  if (!isDealLineName(name) && !isDealLineName(desc)) return "";
  const included = parseDealIncludedItems(desc);
  if (!included.length) return "";
  return `<div class="inc">${included
    .map((line) => `<div>- ${escapeHtml(line)}</div>`)
    .join("")}</div>`;
}

function stripPrintScripts(html: string) {
  return html.replace(/<script>[\s\S]*?<\/script>/gi, "");
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type PrintJob = {
  html: string;
  title: string;
  resolve: (ok: boolean) => void;
};

/** One thermal job at a time — overlapping window.print() kills cheap USB drivers. */
const printQueue: PrintJob[] = [];
let printPumpRunning = false;

/**
 * Print silently when Chrome was launched with --kiosk-printing
 * (use pos/scripts/Launch-POS.bat). Otherwise the system print dialog appears.
 * Jobs are queued so Complete / Reprint / Kitchen never overlap.
 * Resolves true only after the print job actually runs (or false on failure).
 */
function openPrintWindow(html: string, title: string): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    printQueue.push({ html, title, resolve });
    void pumpPrintQueue();
  });
}

async function pumpPrintQueue() {
  if (printPumpRunning) return;
  printPumpRunning = true;
  try {
    while (printQueue.length > 0) {
      const job = printQueue.shift();
      if (!job) break;
      const ok = await runOnePrintJob(job.html, job.title);
      job.resolve(ok);
      // Keep the gap tiny — long sleeps made one-click feel broken.
      if (printQueue.length > 0) await sleep(80);
    }
  } finally {
    printPumpRunning = false;
    if (printQueue.length > 0) void pumpPrintQueue();
  }
}

/**
 * Runs a single print and waits until afterprint (or a short timeout) before
 * tearing down the iframe/popup so the next job cannot collide.
 */
function runOnePrintJob(html: string, title: string): Promise<boolean> {
  const cleanHtml = stripPrintScripts(html);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    try {
      const iframe = document.createElement("iframe");
      iframe.setAttribute("title", title);
      iframe.setAttribute("aria-hidden", "true");
      // Must have a tiny non-zero box — some printers skip 0×0 iframes.
      iframe.style.cssText =
        "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;z-index:-1";
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      const win = iframe.contentWindow;
      if (!doc || !win) {
        iframe.remove();
        throw new Error("iframe unavailable");
      }

      doc.open();
      doc.write(cleanHtml);
      doc.title = title;
      doc.close();

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        try {
          iframe.remove();
        } catch {
          /* ignore */
        }
      };

      const doPrint = () => {
        try {
          win.focus();
          win.print();
        } catch {
          cleanup();
          finish(false);
          return;
        }

        const safety = window.setTimeout(() => {
          cleanup();
          finish(true);
        }, 1800);

        const onAfter = () => {
          window.clearTimeout(safety);
          window.setTimeout(() => {
            cleanup();
            finish(true);
          }, 60);
        };
        win.addEventListener?.("afterprint", onAfter, { once: true });
      };

      // Start as soon as the iframe document is ready — 150ms felt laggy.
      window.setTimeout(doPrint, 40);
    } catch {
      // Popup fallback — still strip scripts so we only print once.
      const w = window.open("", "_blank", "width=320,height=600");
      if (!w) {
        finish(false);
        return;
      }
      try {
        w.document.write(cleanHtml);
        w.document.title = title;
        w.document.close();
      } catch {
        try {
          w.close();
        } catch {
          /* ignore */
        }
        finish(false);
        return;
      }

      window.setTimeout(() => {
        try {
          w.focus();
          w.print();
        } catch {
          try {
            w.close();
          } catch {
            /* ignore */
          }
          finish(false);
          return;
        }

        const safety = window.setTimeout(() => {
          try {
            w.close();
          } catch {
            /* ignore */
          }
          finish(true);
        }, 1800);

        const onAfter = () => {
          window.clearTimeout(safety);
          window.setTimeout(() => {
            try {
              w.close();
            } catch {
              /* ignore */
            }
            finish(true);
          }, 60);
        };
        w.addEventListener?.("afterprint", onAfter, { once: true });
      }, 40);
    }
  });
}

export function kitchenOrderTypeLabel(
  orderType: string,
  orderNotes?: string | null,
): string {
  if (orderType === "walkin") {
    return parseServiceMode(orderNotes) === "parcel" ? "Parcel" : "Dine In";
  }
  if (orderType === "phone") return "Delivery";
  if (orderType === "website" || orderType === "guest") return "Delivery";
  return orderType || "Order";
}

/** Daily # plus channel hint so phone slips are obvious on kitchen + customer. */
export function dailyOrderHeading(order: Order): string {
  const n = order.daily_number;
  if (!n || n <= 0) return "";
  const base = `Order #${n}`;
  if (order.order_type === "phone") return `${base} · Phone Order`;
  return base;
}

/** Parse TABLE:xx from order notes (persisted without schema change). */
export function parseTableNumber(orderNotes?: string | null): string {
  if (!orderNotes) return "";
  const match = orderNotes.match(/(?:^|\|\s*)TABLE:([^\s|]+)/i);
  return match?.[1]?.trim() || "";
}

export type WalkinServiceMode = "dine_in" | "parcel";

/** Parse SERVICE:DINE_IN / SERVICE:PARCEL from order notes. */
export function parseServiceMode(
  orderNotes?: string | null,
): WalkinServiceMode {
  if (!orderNotes) return "dine_in";
  if (/(?:^|\|\s*)SERVICE:PARCEL(?:\s*\||$)/i.test(orderNotes)) return "parcel";
  return "dine_in";
}

export function stripTableFromNotes(orderNotes?: string | null): string {
  if (!orderNotes) return "";
  return orderNotes
    .replace(/(?:^|\|\s*)TABLE:[^\s|]+/gi, "")
    .replace(/(?:^|\|\s*)SERVICE:(?:DINE_IN|PARCEL)/gi, "")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/^\s*\|\s*|\s*\|\s*$/g, "")
    .trim();
}

/** Build walk-in metadata into order_notes (table + dine-in/parcel). */
export function encodeWalkinOrderNotes(opts: {
  tableNumber?: string;
  serviceMode?: WalkinServiceMode;
  extraNotes?: string;
}): string {
  const parts: string[] = [];
  const extra = opts.extraNotes?.trim();
  if (extra) parts.push(extra);
  if (opts.serviceMode === "parcel") parts.push("SERVICE:PARCEL");
  else if (opts.serviceMode === "dine_in") parts.push("SERVICE:DINE_IN");
  if (opts.tableNumber?.trim()) parts.push(`TABLE:${opts.tableNumber.trim()}`);
  return parts.join(" | ");
}

export type KitchenLineMeta = {
  crust?: string;
  toppings?: string;
  extras?: string;
  flavor?: string;
  notes?: string;
};

/** Encode kitchen modifiers into special_instructions for API persistence. */
export function encodeKitchenInstructions(meta: KitchenLineMeta): string {
  const parts: string[] = [];
  if (meta.crust?.trim()) parts.push(`Crust: ${meta.crust.trim()}`);
  if (meta.toppings?.trim()) parts.push(`Toppings: ${meta.toppings.trim()}`);
  if (meta.extras?.trim()) parts.push(`Extras: ${meta.extras.trim()}`);
  if (meta.flavor?.trim()) parts.push(`Flavor: ${meta.flavor.trim()}`);
  if (meta.notes?.trim()) {
    const notes = meta.notes.trim();
    // Avoid duplicating Flavor: if already passed as notes (drink picker).
    if (!/^Flavor:\s*/i.test(notes)) {
      parts.push(notes);
    } else if (!meta.flavor?.trim()) {
      parts.push(notes);
    }
  }
  return parts.join(" | ");
}

export function decodeKitchenInstructions(
  text?: string | null,
): KitchenLineMeta {
  if (!text?.trim()) return {};
  const crust = text.match(/Crust:\s*([^|]+)/i)?.[1]?.trim();
  const toppings = text.match(/Toppings:\s*([^|]+)/i)?.[1]?.trim();
  const extras = text.match(/Extras:\s*([^|]+)/i)?.[1]?.trim();
  const flavor = text.match(/Flavor:\s*([^|]+)/i)?.[1]?.trim();
  const notes = text
    .split("|")
    .map((p) => p.trim())
    .filter(
      (p) =>
        p &&
        !/^Crust:/i.test(p) &&
        !/^Toppings:/i.test(p) &&
        !/^Extras:/i.test(p) &&
        !/^Flavor:/i.test(p),
    )
    .join(" | ");
  return { crust, toppings, extras, flavor, notes: notes || undefined };
}

function itemName(item: OrderItem) {
  const nested = item.product?.name?.trim();
  if (nested) return nested;
  const flat = (item as { product_name?: string }).product_name?.trim();
  if (flat) return flat;
  return "Item";
}

function itemSize(item: OrderItem) {
  const nested = item.product_size?.size?.trim();
  if (nested) return nested;
  const flat = (item as { size?: string }).size?.trim();
  if (flat) return flat;
  return "-";
}

/** Pizza S/M/L/XL only — hide Regular/Deal/etc on kitchen and customer tickets. */
function printablePizzaSize(item: OrderItem) {
  const size = itemSize(item);
  if (!size || size === "-") return "";
  return isPizzaSizeLabel(size) ? size : "";
}

/**
 * Fill missing product/size names on an order before printing.
 * Handles empty nested `product: {}` objects from API/IndexedDB.
 */
export function ensureReceiptItemNames(
  order: Order,
  nameByProductId?: Map<string, string>,
): Order {
  const items = (order.items || []).map((item) => {
    const fromMap = nameByProductId?.get(item.product_id)?.trim();
    const name =
      item.product?.name?.trim() ||
      (item as { product_name?: string }).product_name?.trim() ||
      fromMap ||
      "Item";
    const size =
      item.product_size?.size?.trim() ||
      (item as { size?: string }).size?.trim() ||
      "-";
    return {
      ...item,
      product: {
        id: item.product_id,
        created_at: item.product?.created_at || "",
        updated_at: item.product?.updated_at || "",
        category_id: item.product?.category_id || "",
        name,
        description:
          item.product?.description ||
          (item as { product_description?: string }).product_description ||
          bundledDescriptionByProductId.get(item.product_id) ||
          "",
        image: item.product?.image || "",
        featured: false,
        available: true,
        display_order: 0,
      },
      product_size: {
        id: item.product_size_id,
        created_at: "",
        updated_at: "",
        product_id: item.product_id,
        size,
        price: item.price,
      },
      product_name: name,
      size,
    };
  });
  return {
    ...order,
    items: items as Order["items"],
  };
}

export function buildKitchenReceiptHtml(
  order: Order,
  settings: Settings | null = null,
) {
  // Cashier temp: print the customer receipt for kitchen too (identical slip).
  if (isCashierPrintMode(settings)) {
    return buildCustomerReceiptHtml(order, settings);
  }
  const when = new Date(order.created_at || Date.now());
  const date = when.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = when.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const orderNotes = stripTableFromNotes(order.order_notes);
  const itemCount = (order.items || []).length;
  const qtyTotal = (order.items || []).reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0,
  );
  const kitchenCustomerName = (order.customer_name || "").trim();
  const showKitchenCustomer =
    Boolean(kitchenCustomerName) &&
    order.order_type !== "walkin" &&
    !/^walk[-\s]?in(\s+customer)?$/i.test(kitchenCustomerName);
  const kitchenCustomerHtml = showKitchenCustomer
    ? `<div>Customer : ${escapeHtml(kitchenCustomerName)}</div>`
    : "";

  const itemsHtml = (order.items || [])
    .map((item) => {
      const meta = decodeKitchenInstructions(item.special_instructions);
      const mods = [
        meta.crust ? `Crust: ${meta.crust}` : "",
        meta.toppings ? `Toppings: ${meta.toppings}` : "",
        meta.extras ? `Extras: ${meta.extras}` : "",
        meta.flavor ? `Flavor: ${meta.flavor}` : "",
        meta.notes || "",
      ]
        .filter(Boolean)
        .map((m) => `<div class="mod">${escapeHtml(m)}</div>`)
        .join("");
      const size = printablePizzaSize(item);
      const sizeHtml = size
        ? `<div class="size">${escapeHtml(size)}</div>`
        : "";
      return `
      <tr>
        <td class="col-item">
          <div class="name">${escapeHtml(itemName(item))}</div>
          ${sizeHtml}
          ${dealContentsHtml(item, true)}
          ${mods}
        </td>
        <td class="col-qty">${item.quantity}</td>
      </tr>`;
    })
    .join("");

  const shopTitle = escapeHtml(settings?.restaurant_name || shop.name);
  const shopPhone = (settings?.phone || "").trim();
  const table = parseTableNumber(order.order_notes);
  const service = kitchenOrderTypeLabel(order.order_type, order.order_notes);
  const layout = parseReceiptLayout(settings?.receipt_layout).kitchen;

  const itemsTable = `<table>
    <colgroup>
      <col class="col-item" />
      <col class="col-qty" />
    </colgroup>
    <thead>
      <tr>
        <td class="col-item">Item</td>
        <td class="col-qty">Qty</td>
      </tr>
    </thead>
    <tbody>
      ${
        itemsHtml ||
        `<tr><td class="col-item" colspan="2">No items</td></tr>`
      }
    </tbody>
  </table>`;

  const kitchenBody = layout
    .map((block) => {
      if (!block.visible) return "";
      switch (block.type) {
        case "shop_name":
          return styledBlock(block, "shop", shopTitle);
        case "order_number": {
          const heading = dailyOrderHeading(order);
          return heading
            ? styledBlock(block, "daily-big", escapeHtml(heading))
            : "";
        }
        case "table_service":
          return table
            ? styledBlock(
                block,
                "table-big",
                `TABLE ${escapeHtml(table)}, ${escapeHtml(service)}`,
              )
            : styledBlock(block, "service-big", escapeHtml(service));
        case "banner":
          return styledBlock(
            block,
            "banner",
            escapeHtml(block.text?.trim() || "* Kitchen Order Ticket *"),
          );
        case "datetime":
          return styledBlock(
            block,
            "meta",
            `${escapeHtml(date)} · ${escapeHtml(time)}`,
          );
        case "phone":
          return shopPhone
            ? styledBlock(block, "meta", escapeHtml(shopPhone))
            : "";
        case "customer":
          return kitchenCustomerHtml
            ? styledBlock(block, "meta", kitchenCustomerHtml)
            : "";
        case "items":
          return `<div style="${blockInlineStyle(block)}">${itemsTable}</div>`;
        case "item_count":
          return styledBlock(
            block,
            "foot",
            `<span>Items : ${itemCount}</span><span>Qty : ${qtyTotal}</span>`,
          );
        case "notes":
          return orderNotes
            ? styledBlock(
                block,
                "notes",
                `Notes: ${escapeHtml(orderNotes)}`,
              )
            : "";
        case "staff_notes":
          return styledBlock(block, "write-space", "Staff notes:");
        case "thank_you":
          return styledBlock(
            block,
            "banner",
            escapeHtml(block.text?.trim() || "Thank you!"),
          );
        case "custom_text":
          return block.text?.trim()
            ? styledBlock(block, "meta", escapeHtml(block.text.trim()))
            : "";
        default:
          return "";
      }
    })
    .join("\n  ");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>KITCHEN ${escapeHtml(order.order_number || order.id)}</title>
<style>
  @page { size: 80mm auto; margin: 2mm 5mm 2mm 2mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.35;
    color: #000;
    /* Same safe width as customer ticket — 80mm heads clip the far right. */
    width: 62mm;
    max-width: 62mm;
    margin: 0;
    padding: 0 4mm 0 0;
    overflow: hidden;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .shop {
    text-align: center;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.4px;
    margin: 0 0 4px;
    text-transform: uppercase;
  }
  .banner {
    text-align: center;
    font-weight: 400;
    font-size: 13px;
    padding: 3px 0;
    margin-bottom: 6px;
  }
  .meta {
    font-size: 12px;
    font-weight: 400;
    margin-bottom: 6px;
    word-break: break-word;
  }
  .meta div { margin: 1px 0; }
  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }
  col.col-item { width: auto; }
  col.col-qty { width: 10mm; }
  thead td {
    font-weight: 600;
    font-size: 12px;
    padding: 3px 0;
  }
  tbody td {
    padding: 4px 0;
    vertical-align: top;
    font-weight: 400;
    font-size: 13px;
  }
  .col-qty { text-align: right; }
  .name { white-space: normal; overflow: visible; word-break: break-word; overflow-wrap: anywhere; }
  .size {
    font-weight: 400;
    font-size: 12px;
    margin-top: 1px;
  }
  .inc {
    margin: 2px 0 0 6px;
    font-size: 12px;
    font-weight: 400;
  }
  .mod {
    margin: 1px 0 0 6px;
    font-size: 12px;
    font-weight: 400;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    margin-top: 4px;
    font-size: 12px;
  }
  .notes {
    margin-top: 6px;
    font-weight: 400;
    font-size: 12px;
    word-break: break-word;
  }
  .write-space {
    margin-top: 8px;
    padding-top: 4px;
    min-height: 18mm;
    font-size: 11px;
  }
  .table-big {
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.4px;
    padding: 3px 0;
    margin: 0 0 4px;
    text-transform: uppercase;
  }
  .service-big {
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.4px;
    margin: 0 0 4px;
    text-transform: uppercase;
  }
  .daily-big {
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.4px;
    padding: 3px 0;
    margin: 0 0 4px;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  ${kitchenBody}
</body>
</html>`;
}

export function printKitchenReceipt(
  order: Order,
  settings: Settings | null = null,
): Promise<boolean> {
  return openPrintWindow(
    buildKitchenReceiptHtml(ensureReceiptItemNames(order), settings),
    `Kitchen ${order.order_number || order.id}`,
  );
}

function extractHtmlPart(html: string, tag: "style" | "body"): string {
  const re =
    tag === "style"
      ? /<style[^>]*>([\s\S]*?)<\/style>/i
      : /<body[^>]*>([\s\S]*?)<\/body>/i;
  return html.match(re)?.[1]?.trim() || "";
}

/**
 * One-click complete: kitchen + customer in a single print() so the cashier
 * does not wait for two dialogs / two afterprint cycles.
 */
export function buildOneClickReceiptsHtml(
  order: Order,
  settings: Settings | null,
): string {
  const named = ensureReceiptItemNames(order);
  const completed = { ...named, order_status: "COMPLETED" as const };
  // Cashier temp: two identical customer slips.
  const kitchen = isCashierPrintMode(settings)
    ? buildCustomerReceiptHtml(completed, settings)
    : buildKitchenReceiptHtml(named, settings);
  const customer = buildCustomerReceiptHtml(completed, settings);
  const kitchenCss = extractHtmlPart(kitchen, "style");
  const customerCss = extractHtmlPart(customer, "style");
  const kitchenBody = extractHtmlPart(kitchen, "body");
  const customerBody = extractHtmlPart(customer, "body");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Order ${escapeHtml(String(order.daily_number || order.order_number || order.id))}</title>
<style>
${kitchenCss}
${customerCss}
.ticket { page-break-after: always; }
.ticket:last-child { page-break-after: auto; }
</style>
</head>
<body>
  <div class="ticket">${kitchenBody}</div>
  <div class="ticket">${customerBody}</div>
</body>
</html>`;
}

/** Kitchen + customer receipts in one spool job (admin one-click mode). */
export function printOneClickReceipts(
  order: Order,
  settings: Settings | null,
): Promise<boolean> {
  return openPrintWindow(
    buildOneClickReceiptsHtml(order, settings),
    `Order ${order.order_number || order.id}`,
  );
}

export function buildCustomerReceiptHtml(
  order: Order,
  settings: Settings | null,
  reprint = false,
) {
  const currency = settings?.currency || "Rs";
  const showDealDetails = !isCashierPrintMode(settings);
  const when = new Date(order.created_at || Date.now());
  const lines = (order.items || [])
    .map((item) => {
      const name = itemName(item);
      const size = printablePizzaSize(item);
      const meta = decodeKitchenInstructions(item.special_instructions);
      const extras = [
        meta.crust ? `Crust: ${meta.crust}` : "",
        meta.toppings ? `Toppings: ${meta.toppings}` : "",
        meta.extras ? `Extras: ${meta.extras}` : "",
        meta.flavor ? `Flavor: ${meta.flavor}` : "",
        meta.notes || "",
      ]
        .filter(Boolean)
        .join(" · ");
      const noteHtml = extras
        ? `<div class="note">${escapeHtml(extras)}</div>`
        : "";
      const included = dealContentsHtml(item, showDealDetails);
      const title = size ? `${name} (${size})` : name;
      return `
      <tr>
        <td class="col-item">
          <div class="name">${escapeHtml(title)}</div>
          ${included}
          ${noteHtml}
        </td>
        <td class="col-qty">${item.quantity}</td>
        <td class="col-amt">${formatPrice(item.price * item.quantity, currency)}</td>
      </tr>`;
    })
    .join("");

  const delivery = order.delivery_charge || 0;
  const cod = order.cash_on_delivery_fee || 0;
  const discount = order.discount || 0;
  const tax = 0;
  const siteHost = publicSiteHost();
  const notes = stripTableFromNotes(order.order_notes);
  const isWalkin = order.order_type === "walkin";
  const customerName = (order.customer_name || "").trim();
  const showCustomer =
    Boolean(customerName) &&
    !(
      isWalkin ||
      /^walk[-\s]?in(\s+customer)?$/i.test(customerName)
    );
  const phone = (order.phone || "").trim();
  const showPhone = Boolean(phone) && !/^0+$/.test(phone);
  const address = (order.address || "").trim();
  const showAddress =
    Boolean(address) && !(/^in\s*store$/i.test(address) && isWalkin);
  const customerInfoHtml = [
    showCustomer
      ? `<div class="info">Customer: ${escapeHtml(customerName)}</div>`
      : "",
    showPhone ? `<div class="info">Phone: ${escapeHtml(phone)}</div>` : "",
    showAddress
      ? `<div class="info">Address: ${escapeHtml(address)}</div>`
      : "",
  ]
    .filter(Boolean)
    .join("\n  ");

  const shopPhone = (settings?.phone || "").trim();
  const datePart = when.toLocaleDateString("en-PK");
  const timePart = when.toLocaleTimeString("en-PK");
  const tableNo = parseTableNumber(order.order_notes);
  const cashierSimple = isCashierPrintMode(settings);
  const customerLayout = parseReceiptLayout(settings?.receipt_layout).customer;
  const printShopName = cashierSimple
    ? "Musa Cafe & Pizza Hut"
    : settings?.restaurant_name || shop.name;

  const itemsTable = `<table>
    <colgroup>
      <col class="col-item" />
      <col class="col-qty" />
      <col class="col-amt" />
    </colgroup>
    <thead>
      <tr>
        <td class="col-item">Item</td>
        <td class="col-qty">Qty</td>
        <td class="col-amt">Amt</td>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>`;

  const showSubtotal = !cashierSimple || discount > 0;
  const totalsHtml = `<div class="total">
    ${
      showSubtotal
        ? `<div class="line"><span>Subtotal</span><span>${formatPrice(order.subtotal, currency)}</span></div>`
        : ""
    }
    ${delivery ? `<div class="line"><span>Delivery</span><span>${formatPrice(delivery, currency)}</span></div>` : ""}
    ${cod ? `<div class="line"><span>COD Fee</span><span>${formatPrice(cod, currency)}</span></div>` : ""}
    ${discount ? `<div class="line"><span>Discount</span><span>-${formatPrice(discount, currency)}</span></div>` : ""}
    ${tax ? `<div class="line"><span>Tax</span><span>${formatPrice(tax, currency)}</span></div>` : ""}
    <div class="line grand"><span>TOTAL</span><span>${formatPrice(order.grand_total, currency)}</span></div>
  </div>`;

  const customerBody = customerLayout
    .map((block) => {
      if (!block.visible) return "";
      switch (block.type) {
        case "shop_name":
          return `<h1 style="${blockInlineStyle(block)}">${escapeHtml(printShopName)}</h1>`;
        case "order_number": {
          const heading = dailyOrderHeading(order);
          return heading
            ? styledBlock(block, "daily-line", escapeHtml(heading))
            : "";
        }
        case "table":
          return tableNo
            ? styledBlock(
                block,
                "table-line",
                `TABLE ${escapeHtml(tableNo)}`,
              )
            : "";
        case "phone_datetime": {
          const meta = [shopPhone, datePart, timePart]
            .filter(Boolean)
            .map((part) => escapeHtml(part))
            .join(" · ");
          return styledBlock(
            block,
            "meta",
            `${meta}${reprint ? `<div class="reprint">REPRINT</div>` : ""}`,
          );
        }
        case "phone":
          return shopPhone
            ? styledBlock(block, "meta", escapeHtml(shopPhone))
            : "";
        case "datetime":
          return styledBlock(
            block,
            "meta",
            `${escapeHtml(datePart)} · ${escapeHtml(timePart)}${reprint ? `<div class="reprint">REPRINT</div>` : ""}`,
          );
        case "customer":
          return customerInfoHtml
            ? `<div style="${blockInlineStyle(block)}">${customerInfoHtml}</div>`
            : "";
        case "payment":
          return styledBlock(
            block,
            "info",
            `Payment: ${escapeHtml((order.payment_method || "").toUpperCase())}`,
          );
        case "items":
          return `<div style="${blockInlineStyle(block)}">${itemsTable}</div>`;
        case "totals":
          return `<div style="${blockInlineStyle(block)}">${totalsHtml}</div>`;
        case "notes":
          return notes
            ? styledBlock(block, "notes", `Notes: ${escapeHtml(notes)}`)
            : "";
        case "thank_you":
          return styledBlock(
            block,
            "center",
            escapeHtml(block.text?.trim() || "Thank you!"),
          );
        case "website_qr":
          return siteHost
            ? `<div class="web" style="${blockInlineStyle(block)}">
    ${WEBSITE_QR_SVG}
    <p>Order online &amp; skip the queue<br/>${escapeHtml(siteHost)}</p>
  </div>`
            : "";
        case "staff_notes":
          return styledBlock(block, "write-space", "Staff notes:");
        case "custom_text":
          return block.text?.trim()
            ? styledBlock(block, "center", escapeHtml(block.text.trim()))
            : "";
        default:
          return "";
      }
    })
    .join("\n  ");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(order.order_number || order.id)}</title>
<style>
  @page { size: 80mm auto; margin: 0 5mm 2mm 2mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.32;
    color: #000;
    /*
      iTech / 80mm heads clip the far right ~3–5mm.
      Keep content inside a safe width so Amt / 4-digit prices stay visible.
    */
    width: 62mm;
    max-width: 62mm;
    margin: 0;
    padding: 0 4mm 0 0;
    overflow: hidden;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 {
    font-size: 15px;
    font-weight: 600;
    text-align: center;
    margin: 0 0 4px;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }
  .meta {
    text-align: center;
    margin-bottom: 4px;
    font-size: 11px;
    font-weight: 400;
    line-height: 1.35;
  }
  .meta .reprint {
    font-weight: 700;
    margin-top: 1px;
  }
  .info {
    font-size: 12px;
    font-weight: 400;
    margin: 2px 0;
    word-break: break-word;
  }
  hr {
    display: none;
  }
  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: 13px;
  }
  col.col-item { width: auto; }
  col.col-qty { width: 8mm; }
  /* Keep Amt readable but leave room so item names stay on one line. */
  col.col-amt { width: 18mm; }
  thead td {
    font-weight: 600;
    font-size: 12px;
    padding: 3px 1px 4px 0;
  }
  tbody td {
    padding: 4px 1px 4px 0;
    vertical-align: top;
    font-weight: 400;
  }
  .col-item {
    padding-right: 2px !important;
  }
  .name {
    white-space: normal;
    overflow: visible;
    word-break: break-word;
    overflow-wrap: anywhere;
    font-weight: 400;
    font-size: 13px;
  }
  .col-qty {
    text-align: center;
    white-space: nowrap;
  }
  .col-amt {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    overflow: visible;
    padding-right: 0 !important;
  }
  .note, .inc {
    font-size: 11px;
    font-weight: 400;
    margin-top: 1px;
  }
  .inc { padding-left: 4px; }
  .total {
    margin-top: 5px;
    padding: 4px 0;
    font-size: 12px;
    font-weight: 400;
  }
  .line {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    margin: 2px 0;
  }
  .line span:last-child {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .grand {
    font-size: 13px;
    font-weight: 600;
    margin-top: 4px;
    padding-top: 2px;
  }
  .notes {
    font-size: 12px;
    font-weight: 400;
    margin-top: 5px;
  }
  .center {
    text-align: center;
    font-size: 12px;
    font-weight: 400;
    margin-top: 4px;
  }
  .web {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 3px;
    margin-top: 6px;
    padding-top: 5px;
  }
  .web svg {
    width: 28mm;
    height: 28mm;
    display: block;
    padding: 2mm;
    box-sizing: content-box;
    background: #fff;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
  }
  .web p {
    margin: 0;
    font-size: 11px;
    font-weight: 400;
    line-height: 1.25;
  }
  .write-space {
    margin-top: 8px;
    padding-top: 4px;
    min-height: 18mm;
    font-size: 11px;
  }
  .table-line {
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.4px;
    padding: 1px 0;
    margin: 0 0 3px;
    text-transform: uppercase;
  }
  .daily-line {
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.4px;
    padding: 1px 0;
    margin: 0 0 3px;
    text-transform: uppercase;
  }
  /* Temporary cashier: slightly tighter shop title for longer name. */
  body.cashier-simple h1 {
    font-size: 14px;
    letter-spacing: 0.2px;
    line-height: 1.25;
  }
</style>
</head>
<body class="${cashierSimple ? "cashier-simple" : ""}">
  ${customerBody}
</body>
</html>`;
}

/** Final customer receipt (prices + totals). Works fully offline. */
export function printCustomerReceipt(
  order: Order,
  settings: Settings | null,
  reprint = false,
): Promise<boolean> {
  return openPrintWindow(
    buildCustomerReceiptHtml(ensureReceiptItemNames(order), settings, reprint),
    `Receipt ${order.order_number || order.id}`,
  );
}
