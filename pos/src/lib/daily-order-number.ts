/** Daily shop-facing order tokens (#1, #2…) for Asia/Karachi calendar days. */

import { karachiYmd } from "@/lib/local-sales";
import { cacheGet, cacheSet } from "@/lib/offline-db";

const COUNTER_KEY = "daily_order_counters";

type Counters = Record<string, number>;

async function readCounters(): Promise<Counters> {
  const raw = await cacheGet<Counters>(COUNTER_KEY);
  return raw && typeof raw === "object" ? { ...raw } : {};
}

/**
 * Allocate the next daily number for a Karachi business day.
 * Persisted in IndexedDB so offline POS keeps a stable sequence.
 */
export async function allocateLocalDailyNumber(
  at: Date = new Date(),
): Promise<{ businessDate: string; dailyNumber: number }> {
  const businessDate = karachiYmd(at);
  const counters = await readCounters();
  const next = (Number(counters[businessDate]) || 0) + 1;
  counters[businessDate] = next;
  // Keep only ~14 days of counter keys
  const keys = Object.keys(counters).sort();
  while (keys.length > 14) {
    const drop = keys.shift();
    if (drop) delete counters[drop];
  }
  await cacheSet(COUNTER_KEY, counters);
  return { businessDate, dailyNumber: next };
}

/** Raise local counter if server returned a higher daily number (sync catch-up). */
export async function noteServerDailyNumber(
  businessDate: string,
  dailyNumber: number,
): Promise<void> {
  if (!businessDate || !(dailyNumber > 0)) return;
  const counters = await readCounters();
  const cur = Number(counters[businessDate]) || 0;
  if (dailyNumber > cur) {
    counters[businessDate] = dailyNumber;
    await cacheSet(COUNTER_KEY, counters);
  }
}

export function formatDailyToken(dailyNumber?: number | null): string {
  if (!dailyNumber || dailyNumber <= 0) return "";
  return String(dailyNumber);
}

export function uniqueOrderCode(
  prefix: string,
  businessDate: string,
  dailyNumber: number,
): string {
  const compact = businessDate.replace(/-/g, "");
  return `${prefix}-${compact}-${dailyNumber}`;
}
