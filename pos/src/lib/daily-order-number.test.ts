import { describe, expect, it, beforeEach } from "vitest";
import {
  formatDailyToken,
  uniqueOrderCode,
} from "@/lib/daily-order-number";

describe("daily order number helpers", () => {
  it("formats shop-facing token", () => {
    expect(formatDailyToken(1)).toBe("1");
    expect(formatDailyToken(12)).toBe("12");
    expect(formatDailyToken(0)).toBe("");
    expect(formatDailyToken(null)).toBe("");
  });

  it("builds unique stored code", () => {
    expect(uniqueOrderCode("MC", "2026-09-03", 7)).toBe("MC-20260903-7");
  });
});
