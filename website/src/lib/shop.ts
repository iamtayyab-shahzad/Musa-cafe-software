import shopConfig from "@/data/shop.json";

export type ShopConfig = typeof shopConfig;

/** Canonical shop identity. Change shared/shop.json — do not scatter names in UI. */
export const shop: ShopConfig = shopConfig;

export function storageKey(name: string) {
  return `${shop.storageKeyPrefix}_${name}`;
}

export function publicSiteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return (shop.siteUrl || "http://localhost:3000").replace(/\/$/, "");
}

export function shopDisplayParts() {
  const name = shop.name.trim();
  const shortName = shop.shortName.trim();
  if (shortName && name.toLowerCase().startsWith(shortName.toLowerCase())) {
    return {
      accent: shortName,
      rest: name.slice(shortName.length).trim(),
    };
  }
  const [first, ...more] = name.split(" ");
  return { accent: first || name, rest: more.join(" ") };
}
