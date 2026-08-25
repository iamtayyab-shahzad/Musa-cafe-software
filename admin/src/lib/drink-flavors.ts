export const DEFAULT_DRINK_FLAVORS = ["Coke", "Sprite", "Fanta"];

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
    /* fall through */
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
