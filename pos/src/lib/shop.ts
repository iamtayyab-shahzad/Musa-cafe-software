import shopConfig from "@/data/shop.json";

export type ShopConfig = typeof shopConfig;

/** Canonical shop identity. Change shared/shop.json — do not scatter names in UI. */
export const shop: ShopConfig = shopConfig;

export function storageKey(name: string) {
  return `${shop.storageKeyPrefix}_${name}`;
}

export function publicSiteHost() {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || shop.siteUrl || "").trim();
  if (!raw || /localhost|127\.0\.0\.1/i.test(raw)) return "";
  try {
    return new URL(raw).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}
