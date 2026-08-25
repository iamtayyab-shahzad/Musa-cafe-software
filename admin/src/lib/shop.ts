import shopConfig from "@/data/shop.json";

export const shop = shopConfig;

export function storageKey(name: string) {
  return `${shop.storageKeyPrefix}_${name}`;
}
