import { beforeEach, describe, expect, it, vi } from "vitest";

const store: { counters: Record<string, number>; orders: unknown[] } = {
  counters: {},
  orders: [],
};

vi.mock("@/lib/offline-db", () => ({
  cacheGet: async (key: string) =>
    key === "daily_order_counters" ? { ...store.counters } : null,
  cacheSet: async (key: string, value: unknown) => {
    if (key === "daily_order_counters") {
      store.counters = { ...(value as Record<string, number>) };
    }
  },
  listLocalOrders: async () => store.orders,
}));

vi.mock("@/lib/network", () => ({
  isOnline: () => false,
}));

import {
  allocateLocalDailyNumber,
  formatDailyToken,
  maxDailyForDate,
  seedDailyCountersFromOrders,
  uniqueOrderCode,
} from "@/lib/daily-order-number";

describe("daily order number helpers", () => {
  beforeEach(() => {
    store.counters = {};
    store.orders = [];
  });

  it("formats shop-facing token", () => {
    expect(formatDailyToken(1)).toBe("1");
    expect(formatDailyToken(12)).toBe("12");
    expect(formatDailyToken(0)).toBe("");
    expect(formatDailyToken(null)).toBe("");
  });

  it("builds unique stored code", () => {
    expect(uniqueOrderCode("MC", "2026-09-03", 7)).toBe("MC-20260903-7");
  });

  it("finds the highest token for a Karachi business date", () => {
    expect(
      maxDailyForDate(
        [
          { business_date: "2026-09-03", daily_number: 4 },
          { business_date: "2026-09-03", daily_number: 15 },
          { business_date: "2026-09-02", daily_number: 40 },
          {
            created_at: "2026-09-03T16:00:00.000Z",
            daily_number: 9,
          },
        ],
        "2026-09-03",
      ),
    ).toBe(15);
  });

  it("does not restart at 1 when local tickets already exist", async () => {
    store.orders = [
      { business_date: "2026-09-03", daily_number: 15, created_at: "2026-09-03T10:00:00+05:00" },
    ];
    const first = await allocateLocalDailyNumber(
      new Date("2026-09-03T21:00:00+05:00"),
    );
    expect(first.businessDate).toBe("2026-09-03");
    expect(first.dailyNumber).toBe(16);
    const second = await allocateLocalDailyNumber(
      new Date("2026-09-03T21:05:00+05:00"),
    );
    expect(second.dailyNumber).toBe(17);
  });

  it("starts at 1 after Karachi midnight", async () => {
    store.counters = { "2026-09-02": 22 };
    store.orders = [
      { business_date: "2026-09-02", daily_number: 22, created_at: "2026-09-02T23:50:00+05:00" },
    ];
    const next = await allocateLocalDailyNumber(
      new Date("2026-09-03T00:05:00+05:00"),
    );
    expect(next.businessDate).toBe("2026-09-03");
    expect(next.dailyNumber).toBe(1);
  });

  it("seeds counters from a server list", async () => {
    await seedDailyCountersFromOrders([
      { business_date: "2026-09-03", daily_number: 15 },
    ]);
    const next = await allocateLocalDailyNumber(
      new Date("2026-09-03T21:00:00+05:00"),
    );
    expect(next.dailyNumber).toBe(16);
  });
});
