export const DEFAULT_DRINK_FLAVORS = ["Coke", "Sprite", "Fanta"];

export function requiresDrinkFlavor(product: {
  id?: string;
  name?: string;
  description?: string;
}): boolean {
  const n = `${product.name || ""} ${product.description || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!n.includes("drink")) return false;
  return (
    n.includes("500 ml") ||
    n.includes("500ml") ||
    n.includes("1 liter") ||
    n.includes("1 litre") ||
    n.includes("1.5 liter") ||
    n.includes("2.25 liter") ||
    n.includes("regular drink") ||
    n.includes("ltr drink") ||
    n.includes("liter drink") ||
    n.includes("litre drink")
  );
}

/** Parse settings.drink_flavors JSON (or comma list) into clean unique names. */
export function parseDrinkFlavors(raw?: string | null): string[] {
  if (!raw?.trim()) return [...DEFAULT_DRINK_FLAVORS];
  const text = raw.trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const list = parsed
        .map((x) => String(x || "").trim())
        .filter(Boolean);
      return list.length ? uniquePreserve(list) : [...DEFAULT_DRINK_FLAVORS];
    }
  } catch {
    /* fall through to comma-split */
  }
  const list = text
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? uniquePreserve(list) : [...DEFAULT_DRINK_FLAVORS];
}

export function serializeDrinkFlavors(flavors: string[]): string {
  return JSON.stringify(
    uniquePreserve(flavors.map((f) => f.trim()).filter(Boolean)),
  );
}

function uniquePreserve(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function formatDrinkFlavorNote(flavor: string): string {
  return `Flavor: ${flavor.trim()}`;
}
