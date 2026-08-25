import { pizzaCategoryIds } from "@/data/krunchies";

const PIZZA_SIZE_RE =
  /^(p|s|m|l|xl|personal|small|medium|large|family|extra\s*large|x-?large)$/i;

const pizzaIdsLower = new Set(
  [...pizzaCategoryIds].map((id) => id.toLowerCase()),
);

export function isPizzaSizeLabel(size?: string | null): boolean {
  return PIZZA_SIZE_RE.test((size || "").trim());
}

/** S/M/L/XL only — leftover Regular rows stay in the DB for old tickets. */
export function pizzaSellableSizes<T extends { size?: string }>(
  sizes: T[] | undefined | null,
): T[] {
  return (sizes || []).filter((s) => isPizzaSizeLabel(s.size));
}

export function isPizzaCategoryName(name?: string | null): boolean {
  return (name || "").toLowerCase().includes("pizza");
}

export function isPizzaProduct(product: {
  category_id?: string;
  category?: { id?: string; name?: string } | null;
}): boolean {
  const catId = (
    product.category_id ||
    product.category?.id ||
    ""
  ).toLowerCase();
  if (catId && pizzaIdsLower.has(catId)) return true;
  return isPizzaCategoryName(product.category?.name);
}
