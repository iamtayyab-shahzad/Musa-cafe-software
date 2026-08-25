import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { storageKey } from "@/lib/shop";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(amount: number, currency = "Rs") {
  return `${currency} ${Number(amount || 0).toLocaleString("en-PK")}`;
}

/** Format a base-unit stock quantity for display (e.g. 12500 g → "12.5 KG"). */
export function formatStock(qty: number, unit: string, purchaseUnit?: string, unitsPerPurchase?: number) {
  const u = (unit || "").toLowerCase();
  const pu = (purchaseUnit || "").toLowerCase();
  const upp = Number(unitsPerPurchase || 0);
  if (upp > 1 && (u === "g" || u === "ml") && qty >= upp) {
    const converted = qty / upp;
    const label = purchaseUnit || (u === "g" ? "KG" : "L");
    return `${converted.toLocaleString("en-PK", { maximumFractionDigits: 2 })} ${label}`;
  }
  if ((u === "g" || u === "ml") && Math.abs(qty) >= 1000) {
    return `${(qty / 1000).toLocaleString("en-PK", { maximumFractionDigits: 2 })} ${u === "g" ? "KG" : "L"}`;
  }
  if (pu === "carton" && upp > 1 && Math.abs(qty) >= upp) {
    return `${(qty / upp).toLocaleString("en-PK", { maximumFractionDigits: 1 })} ${purchaseUnit}`;
  }
  return `${Number(qty || 0).toLocaleString("en-PK")} ${unit || ""}`.trim();
}

export const AUTH_KEY = storageKey("admin_auth");
export const TOKEN_KEY = storageKey("admin_token");
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";
export const POS_URL =
  process.env.NEXT_PUBLIC_POS_URL || "http://localhost:3001";
