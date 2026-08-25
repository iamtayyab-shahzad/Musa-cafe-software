import type { Order } from "@/types";
import { dedupeOrdersByIdentity } from "@/lib/order-identity";

const KARACHI = "Asia/Karachi";

/** Asia/Karachi calendar day as YYYY-MM-DD. */
export function karachiYmd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KARACHI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Instant range [start, end) for a Karachi calendar day as UTC ISO strings.
 * Matches backend businessDayRange for Asia/Karachi midnights.
 */
export function karachiDayBoundsUtc(
  dayYmd: string,
): { startMs: number; endMs: number } {
  // Parse YMD as Karachi local midnight via offset fixed +05:00 (PKT has no DST).
  const start = new Date(`${dayYmd}T00:00:00+05:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function isCompletedSale(order: Order): boolean {
  const status = String(order.order_status || "").toUpperCase();
  return status === "COMPLETED";
}

/** Unique COMPLETED sales in [startMs, endMs). Twins (LOCAL-* + server id) count once. */
export function completedSalesInRange(
  orders: Order[],
  startMs: number,
  endMs: number,
): { total: number; orderCount: number } {
  let total = 0;
  let orderCount = 0;
  const source = Array.isArray(orders) ? orders : [];
  let unique: Order[] = [];
  try {
    unique = dedupeOrdersByIdentity(source.filter((o) => o && o.id));
  } catch {
    unique = source.filter((o) => o && o.id);
  }
  for (const order of unique) {
    try {
      if (!isCompletedSale(order)) continue;
      const t = Date.parse(order.created_at || "");
      if (!Number.isFinite(t) || t < startMs || t >= endMs) continue;
      const amount = Number(order.grand_total);
      if (!Number.isFinite(amount)) continue;
      total += amount;
      orderCount += 1;
    } catch {
      /* one bad row must not zero the till total */
    }
  }
  return { total, orderCount };
}

/** Sum grand_total of unique COMPLETED orders with created_at in [startMs, endMs). */
export function sumCompletedSalesInRange(
  orders: Order[],
  startMs: number,
  endMs: number,
): number {
  return completedSalesInRange(orders, startMs, endMs).total;
}

/** Karachi calendar day completed sales from local orders. */
export function localSalesForKarachiDay(
  orders: Order[],
  dayYmd: string,
): { total: number; orderCount: number } {
  const { startMs, endMs } = karachiDayBoundsUtc(dayYmd);
  return completedSalesInRange(orders, startMs, endMs);
}

/** Today's completed sales (Karachi calendar day) from local orders. */
export function localTodaySales(
  orders: Order[],
  now: Date = new Date(),
): number {
  const { startMs, endMs } = karachiDayBoundsUtc(karachiYmd(now));
  return sumCompletedSalesInRange(orders, startMs, endMs);
}

/** Rolling last 7 days completed sales ending now (matches backend WeeklySales). */
export function localWeeklySales(
  orders: Order[],
  now: Date = new Date(),
): number {
  const endMs = now.getTime();
  const startMs = endMs - 7 * 24 * 60 * 60 * 1000;
  return sumCompletedSalesInRange(orders, startMs, endMs);
}

/** Rolling last ~1 month completed sales (matches backend MonthlySales). */
export function localMonthlySales(
  orders: Order[],
  now: Date = new Date(),
): number {
  const end = now;
  const start = new Date(end);
  start.setMonth(start.getMonth() - 1);
  return sumCompletedSalesInRange(orders, start.getTime(), end.getTime());
}

/** Yesterday Karachi calendar day. */
export function localYesterdaySales(
  orders: Order[],
  now: Date = new Date(),
): number {
  const today = karachiYmd(now);
  const todayStart = new Date(`${today}T00:00:00+05:00`);
  const yday = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const ymd = karachiYmd(yday);
  const { startMs, endMs } = karachiDayBoundsUtc(ymd);
  return sumCompletedSalesInRange(orders, startMs, endMs);
}
