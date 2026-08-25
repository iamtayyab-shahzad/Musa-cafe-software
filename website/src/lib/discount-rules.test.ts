import { describe, expect, it } from "vitest";
import {
  bestDiscountLabel,
  discountFromRules,
  ruleMatchesSchedule,
  type DiscountRule,
} from "./discount-rules";

describe("discount-rules", () => {
  it("picks best discount and labels it", () => {
    const day = new Date("2026-08-20T12:00:00+05:00");
    const rules: DiscountRule[] = [
      {
        name: "10%",
        active: true,
        percent: 10,
        min_subtotal: 0,
        schedule_type: "always",
        exclude_deals: false,
      },
      {
        name: "Flash 25%",
        active: true,
        percent: 25,
        min_subtotal: 500,
        schedule_type: "always",
        exclude_deals: false,
      },
    ];
    const lines = [{ price: 1000, quantity: 1 }];
    expect(discountFromRules(rules, lines, day)).toBe(250);
    expect(bestDiscountLabel(rules, lines, day)).toBe("Flash 25%");
  });

  it("matches always-until end date", () => {
    const rule: DiscountRule = {
      name: "Until",
      active: true,
      percent: 10,
      min_subtotal: 0,
      schedule_type: "always",
      end_date: "2026-08-31",
    };
    expect(ruleMatchesSchedule(rule, new Date("2026-08-30T12:00:00+05:00"))).toBe(
      true,
    );
    expect(ruleMatchesSchedule(rule, new Date("2026-09-01T12:00:00+05:00"))).toBe(
      false,
    );
  });
});
