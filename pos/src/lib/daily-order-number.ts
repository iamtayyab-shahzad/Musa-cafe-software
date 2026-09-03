/** Daily shop-facing order tokens (#1, #2…) for Asia/Karachi calendar days. */

import type { Order } from "@/types";
import { karachiYmd } from "@/lib/local-sales";
import { isOnline } from "@/lib/network";
import { cacheGet, cacheSet } from "@/lib/offline-db";

const COUNTER_KEY = "daily_order_counters";
const HYDRATE_TTL_MS = 30_000;
const HYDRATE_WAIT_MS = 2_500;

type Counters = Record<string, number>;

let lastHydratedDate = "";
let lastHydratedAt = 0;

async function readCounters(): Promise<Counters> {
  const raw = await cacheGet<Counters>(COUNTER_KEY);
  return raw && typeof raw === "object" ? { ...raw } : {};
}

async function writeCounters(counters: Counters): Promise<void> {
  const keys = Object.keys(counters).sort();
  while (keys.length > 14) {
    const drop = keys.shift();
    if (drop) delete counters[drop];
  }
  await cacheSet(COUNTER_KEY, counters);
}

function orderBusinessDate(order: Pick<Order, "business_date" | "created_at">): string {
  const dated = (order.business_date || "").trim();
  if (dated.length === 10) return dated;
  if (!order.created_at) return "";
  const parsed = new Date(order.created_at);
  if (Number.isNaN(parsed.getTime())) return "";
  return karachiYmd(parsed);
}

/** Highest daily token already used on this Karachi business date. */
export function maxDailyForDate(
  orders: Array<Pick<Order, "business_date" | "created_at" | "daily_number">>,
  businessDate: string,
): number {
  let max = 0;
  for (const order of orders) {
    if (orderBusinessDate(order) !== businessDate) continue;
    const n = Number(order.daily_number) || 0;
    if (n > max) max = n;
  }
  return max;
}

/** Raise persisted counters so they never sit below known tickets. */
export async function seedDailyCountersFromOrders(
  orders: Array<Pick<Order, "business_date" | "created_at" | "daily_number">>,
): Promise<void> {
  if (!orders.length) return;
  const counters = await readCounters();
  let changed = false;
  for (const order of orders) {
    const date = orderBusinessDate(order);
    const n = Number(order.daily_number) || 0;
    if (!date || !(n > 0)) continue;
    if (n > (Number(counters[date]) || 0)) {
      counters[date] = n;
      changed = true;
    }
  }
  if (changed) await writeCounters(counters);
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
    await writeCounters(counters);
  }
}

async function floorForDate(businessDate: string): Promise<number> {
  const counters = await readCounters();
  let floor = Number(counters[businessDate]) || 0;
  try {
    const { listLocalOrders } = await import("@/lib/offline-db");
    const fromOrders = maxDailyForDate(await listLocalOrders(), businessDate);
    if (fromOrders > floor) floor = fromOrders;
  } catch {
    /* IndexedDB unavailable in tests / first paint */
  }
  return floor;
}

/**
 * Pull today's tickets from the API so a fresh browser / USB copy
 * does not restart at #1 while history already has #15.
 */
export async function hydrateDailyNumberFromServer(
  businessDate: string,
  opts?: { force?: boolean },
): Promise<void> {
  if (!businessDate || !isOnline()) return;
  if (
    !opts?.force &&
    lastHydratedDate === businessDate &&
    Date.now() - lastHydratedAt < HYDRATE_TTL_MS
  ) {
    return;
  }
  const { apiFetch } = await import("@/lib/api-client");
  const rows = await apiFetch<Order[]>(
    `/orders?limit=200&start=${encodeURIComponent(businessDate)}&end=${encodeURIComponent(businessDate)}`,
  );
  if (Array.isArray(rows)) {
    await seedDailyCountersFromOrders(rows);
  }
  lastHydratedDate = businessDate;
  lastHydratedAt = Date.now();
}

/**
 * Allocate the next daily number for a Karachi business day.
 * Persisted in IndexedDB so offline POS keeps a stable sequence.
 * Always floors against local tickets so an empty counter cannot print #1
 * while today's orders already exist on this device.
 */
export async function allocateLocalDailyNumber(
  at: Date = new Date(),
): Promise<{ businessDate: string; dailyNumber: number }> {
  const businessDate = karachiYmd(at);
  const next = (await floorForDate(businessDate)) + 1;
  const counters = await readCounters();
  counters[businessDate] = next;
  await writeCounters(counters);
  return { businessDate, dailyNumber: next };
}

/** Seed from the live API (when reachable), then allocate. */
export async function allocateNextDailyNumber(
  at: Date = new Date(),
): Promise<{ businessDate: string; dailyNumber: number }> {
  const businessDate = karachiYmd(at);
  try {
    await Promise.race([
      hydrateDailyNumberFromServer(businessDate),
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("hydrate timeout")), HYDRATE_WAIT_MS);
      }),
    ]);
  } catch {
    /* offline, timeout, or API error — local floor still applies */
  }
  return allocateLocalDailyNumber(at);
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
