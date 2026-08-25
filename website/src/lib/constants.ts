import { publicSiteUrl, shop, storageKey } from "@/lib/shop";

export const SITE_NAME = shop.name;
export const SITE_URL = publicSiteUrl();
export const SITE_DESCRIPTION = `Order pizza, burgers, shawarma, pasta, broast and deals from ${shop.name}. Fast food and takeaway in Musa Khel.`;

/** Cache-busted so Google/browsers pick up logo favicon after deploys. */
export const SITE_OG_IMAGE = `${shop.logo || "/logo.svg"}?v=1`;
export const FAVICON_VERSION = "1";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export const PAYMENT_METHODS = [
  {
    id: "easypaisa" as const,
    label: "EasyPaisa",
    description: "QR or transfer using Raast / JazzCash details",
    showQr: true,
  },
  {
    id: "jazzcash" as const,
    label: "JazzCash",
    description: "QR, Till ID, or JazzCash number",
    showQr: true,
  },
  {
    id: "bank" as const,
    label: "Other Bank Payments",
    description: "Pay via IBAN / Raast from any bank",
    showQr: true,
  },
  {
    id: "cod" as const,
    label: "Cash on Delivery",
    description: "Pay when your order arrives",
    showQr: false,
  },
] as const;

export const PAYMENT_QR_SRC = shop.payments.qrSrc;
export const PAYMENT_DETAILS = shop.payments;

export const PASSWORD_RESET_WHATSAPP = shop.phone;

export const CART_STORAGE_KEY = storageKey("cart");
export const AUTH_STORAGE_KEY = storageKey("auth");
export const AUTH_TOKEN_STORAGE_KEY = storageKey("customer_token");
export const LAST_ORDER_KEY = storageKey("last_order");
