import { storageKey } from "@/lib/shop";

export type Locale = "en" | "ur";

export const LOCALE_STORAGE_KEY = storageKey("locale");

export type MessageKey = keyof typeof en;

const en = {
  nav_home: "Home",
  nav_menu: "Menu",
  nav_about: "About",
  nav_contact: "Contact",
  nav_login: "Login",
  nav_logout: "Logout",
  nav_cart: "Cart",
  nav_orders: "My Orders",
  nav_order_online: "Order Online",
  lang_en: "EN",
  lang_ur: "اردو",
  lang_switch: "Language",

  menu_title: "Menu",
  menu_subtitle:
    "Official Musa Cafe menu — pizzas, burgers, shawarma, pasta, broast, shakes, and family deals.",
  menu_categories: "Categories",
  menu_all_items: "All Items",
  menu_search: "Search menu...",
  menu_filter_all: "All",
  menu_filter_pizzas: "Pizzas",
  menu_filter_other: "Other",
  menu_empty: "No products found.",
  menu_unavailable: "Menu is temporarily unavailable.",
  menu_retry: "Retry",
  menu_from: "From",
  menu_add: "Add",
  menu_view: "View",

  footer_explore: "Explore",
  footer_contact: "Contact",
  footer_hours: "Open daily",
  footer_follow: "Follow us",

  cart_title: "Your Cart",
  cart_empty: "Your cart is empty",
  cart_checkout: "Checkout",
  cart_total: "Total",
  cart_view: "View cart",

  common_loading: "Loading...",
  common_close: "Close",
  common_save: "Save",
  common_cancel: "Cancel",
  common_continue: "Continue",

  hours_badge_open: "OPEN",
  hours_badge_closed: "CLOSED",
  hours_still_order: "You can still place an order",
  hours_banner_open:
    "We're open · Ordering until {close} (Pakistan time)",
  hours_banner_closed:
    "We're closed now · You can still order — we'll prepare it {when} at {open}",
  hours_when_today: "today when we open",
  hours_when_tomorrow: "tomorrow when we open",
  hours_detail_closed:
    "The shop is closed right now (open {open} – {close}, Pakistan time). You can still place your order — we will prepare and serve it {when} at {open}.",
} as const;

const ur: Record<MessageKey, string> = {
  nav_home: "ہوم",
  nav_menu: "مینو",
  nav_about: "ہمارے بارے میں",
  nav_contact: "رابطہ",
  nav_login: "لاگ اِن",
  nav_logout: "لاگ آؤٹ",
  nav_cart: "کارٹ",
  nav_orders: "میرے آرڈرز",
  nav_order_online: "آن لائن آرڈر",
  lang_en: "EN",
  lang_ur: "اردو",
  lang_switch: "زبان",

  menu_title: "مینو",
  menu_subtitle:
    "موسیٰ کیفے کا سرکاری مینو — پیزا، برگر، شاورما، پاستا، بروست، شیکس اور فیملی ڈیلز۔",
  menu_categories: "کیٹگریز",
  menu_all_items: "تمام آئٹمز",
  menu_search: "مینو تلاش کریں...",
  menu_filter_all: "سب",
  menu_filter_pizzas: "پیزاز",
  menu_filter_other: "دیگر",
  menu_empty: "کوئی پروڈکٹ نہیں ملا۔",
  menu_unavailable: "مینو عارضی طور پر دستیاب نہیں۔",
  menu_retry: "دوبارہ کوشش",
  menu_from: "سے",
  menu_add: "شامل کریں",
  menu_view: "دیکھیں",

  footer_explore: "دریافت کریں",
  footer_contact: "رابطہ",
  footer_hours: "روزانہ کھلا",
  footer_follow: "ہمیں فالو کریں",

  cart_title: "آپ کی کارٹ",
  cart_empty: "آپ کی کارٹ خالی ہے",
  cart_checkout: "چیک آؤٹ",
  cart_total: "کل",
  cart_view: "کارٹ دیکھیں",

  common_loading: "لوڈ ہو رہا ہے...",
  common_close: "بند کریں",
  common_save: "محفوظ کریں",
  common_cancel: "منسوخ",
  common_continue: "جاری رکھیں",

  hours_badge_open: "کھلا",
  hours_badge_closed: "بند",
  hours_still_order: "آپ اب بھی آرڈر دے سکتے ہیں",
  hours_banner_open:
    "ہم کھلے ہیں · آرڈر {close} تک (پاکستان وقت)",
  hours_banner_closed:
    "ابھی بند ہے · آرڈر دے سکتے ہیں — تیاری {when} {open} پر ہوگی",
  hours_when_today: "آج کھلنے پر",
  hours_when_tomorrow: "کل کھلنے پر",
  hours_detail_closed:
    "دکان ابھی بند ہے (کھلی {open} – {close}، پاکستان وقت)۔ آپ آرڈر دے سکتے ہیں — ہم اسے {when} {open} پر تیار کر کے دیں گے۔",
};

export const messages = { en, ur } as const;

/** Category display names in Urdu (matched by English catalog name). */
export const categoryNameUrdu: Record<string, string> = {
  Deals: "ڈیلز",
  "Standard Pizza": "اسٹینڈرڈ پیزا",
  "Premium Pizza": "پریمیم پیزا",
  Burgers: "برگرز",
  Fries: "فرائز",
  Pasta: "پاستا",
  "Wings & Snacks": "ونگس اور اسنیکس",
  "Rolls & Shawarma": "رولز اور شاورما",
  Broast: "بروست",
  Sandwiches: "سینڈوچ",
  Chinese: "چائنیز",
  Chowmein: "چاؤمین",
  Nachos: "ناچوز",
  Sweets: "مٹھائی",
  Samosas: "سموسے",
  Cakes: "کیک",
};

export function translateCategoryName(name: string, locale: Locale): string {
  if (locale !== "ur") return name;
  return categoryNameUrdu[name] || name;
}
