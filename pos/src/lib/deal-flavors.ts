/**
 * FLAG: pizza-deal flavor picker — do not rewrite yet.
 *
 * This module is still hardcoded around pizza size/tier logic
 * (P/S/M/L/XL + regular vs special) and pizza/deals category slugs.
 * Musa Cafe pizza deals still use it for small/medium/large/XL flavor picks.
 * Other categories can skip this feature.
 *
 * Current call sites (POS):
 *   deal-flavor-dialog.tsx, orders/new/page.tsx, bill-context.tsx,
 *   services/api.ts, lib/utils.ts, receipt.ts, receipt.test.ts
 */
import type { Product } from "@/types";
import { menuCatalog } from "@/data/krunchies";

export type PizzaSizeCode = "P" | "S" | "M" | "L" | "XL";
export type PizzaTier = "regular" | "special";

export type DealPizzaSlot = {
  id: string;
  label: string;
  size: PizzaSizeCode;
  tier: PizzaTier;
};

function idsForSlugs(...slugs: string[]) {
  return new Set(
    menuCatalog.categories
      .filter((c) => slugs.includes(c.slug))
      .map((c) => c.id.toLowerCase()),
  );
}

const REGULAR_PIZZA_CATEGORY_IDS = idsForSlugs("standard-pizza", "pizza-regular");
const SPECIAL_PIZZA_CATEGORY_IDS = idsForSlugs(
  "premium-pizza",
  "special-pizza",
);
const DEALS_CATEGORY_IDS = idsForSlugs("deals");

const SIZE_ALIASES: Record<string, PizzaSizeCode> = {
  personal: "P",
  p: "P",
  small: "S",
  s: "S",
  medium: "M",
  m: "M",
  large: "L",
  l: "L",
  family: "XL",
  xl: "XL",
  "extra large": "XL",
  "x large": "XL",
  xlarge: "XL",
  "x-large": "XL",
};

export function parseDealPizzaSlots(description: string): DealPizzaSlot[] {
  const slots: DealPizzaSlot[] = [];
  const re =
    /(\d+)\s*(personal|small|medium|large|family|x\s*large|xl|extra\s*large|s|m|l|p)\s+pizzas?(?:\s+(special|premium))?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(description)) !== null) {
    const count = Math.min(8, Math.max(1, Number(match[1]) || 1));
    const sizeToken = match[2].toLowerCase().replace(/\s+/g, " ").trim();
    const size = SIZE_ALIASES[sizeToken] || "L";
    const resolvedTier: PizzaTier = match[3] ? "special" : "regular";
    for (let i = 0; i < count; i += 1) {
      const n = slots.length + 1;
      const tierLabel = resolvedTier === "special" ? "Premium" : "Standard";
      slots.push({
        id: `pizza-${n}`,
        label: `${tierLabel} pizza flavor ${n} (${size})`,
        size,
        tier: resolvedTier,
      });
    }
  }
  return slots;
}

export function isDealProduct(product: Product) {
  const catId = (product.category_id || product.category?.id || "").toLowerCase();
  if (catId && DEALS_CATEGORY_IDS.has(catId)) return true;
  const name = (product.category?.name || "").toLowerCase();
  if (name.includes("deal")) return true;
  const productName = (product.name || "").toLowerCase();
  return productName.includes("deal") || productName.includes("mega combo");
}

export function parseDealIncludedItems(description: string | undefined | null): string[] {
  const raw = (description || "").trim();
  if (!raw) return [];
  const withoutPromo = raw
    .replace(/home delivery free!?/gi, "")
    .replace(/perfect combo[^.!]*/gi, "")
    .replace(/great taste[^.!]*/gi, "")
    .replace(/best value!?/gi, "")
    .replace(/mazay ka[^.!]*/gi, "")
    .replace(/choose flavor[^.!]*/gi, "");
  const parts = withoutPromo
    .split(/,|\band\b/gi)
    .map((p) => p.replace(/[.!]+$/g, "").trim())
    .filter((p) => p.length > 2 && !/^perfect|^great|^best|^mazay/i.test(p));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

export function requiresDealFlavorChoice(product: Product) {
  return (
    isDealProduct(product) &&
    parseDealPizzaSlots(product.description || "").length > 0
  );
}

function categoryIdOf(product: Product): string {
  return (product.category_id || product.category?.id || "").toLowerCase();
}

function isRegularPizzaProduct(product: Product): boolean {
  const id = categoryIdOf(product);
  if (REGULAR_PIZZA_CATEGORY_IDS.has(id)) return true;
  const cat = (product.category?.name || "").toLowerCase();
  return (
    (cat.includes("standard") || cat.includes("regular")) &&
    cat.includes("pizza")
  );
}

function isSpecialPizzaProduct(product: Product): boolean {
  const id = categoryIdOf(product);
  if (SPECIAL_PIZZA_CATEGORY_IDS.has(id)) return true;
  const cat = (product.category?.name || "").toLowerCase();
  if (cat.includes("burger") || cat.includes("regular") || cat.includes("standard")) {
    return false;
  }
  return (cat.includes("premium") || cat.includes("special")) && cat.includes("pizza");
}

export function flavorsForSlot(
  products: Product[],
  slot: DealPizzaSlot,
): Product[] {
  return products.filter((p) => {
    if (isDealProduct(p)) return false;
    const tierOk =
      slot.tier === "special"
        ? isSpecialPizzaProduct(p)
        : isRegularPizzaProduct(p);
    if (!tierOk) return false;
    return (p.sizes || []).some((s) => normalizeSize(s.size) === slot.size);
  });
}

export function normalizeSize(size: string): PizzaSizeCode | null {
  const t = size.trim().toUpperCase();
  if (t === "P" || t === "PERSONAL") return "P";
  if (t === "S" || t === "SMALL") return "S";
  if (t === "M" || t === "MEDIUM") return "M";
  if (t === "L" || t === "LARGE") return "L";
  if (t === "XL" || t === "EXTRA LARGE" || t === "X-LARGE" || t === "FAMILY") {
    return "XL";
  }
  return null;
}
