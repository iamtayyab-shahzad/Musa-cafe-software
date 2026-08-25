import { describe, expect, it } from "vitest";
import {
  bestDiscountLabel,
  bestMatchingRule,
  discountFromRules,
  ruleMatchesSchedule,
  type DiscountRule,
} from "@/lib/discount-rules";

const friSun: DiscountRule = {
  name: "Fri & Sun 10% off",
  active: true,
  percent: 10,
  min_subtotal: 1000,
  schedule_type: "weekdays",
  end_date: "2026-08-31",
  weekdays_json: "[5,0]",
  exclude_deals: true,
};

describe("discount-rules", () => {
  it("matches weekdays schedule in Asia/Karachi", () => {
    expect(ruleMatchesSchedule(friSun, new Date("2026-08-07T12:00:00+05:00"))).toBe(
      true,
    );
    expect(ruleMatchesSchedule(friSun, new Date("2026-08-08T12:00:00+05:00"))).toBe(
      false,
    );
  });

  it("picks best (max Rs) among overlapping rules", () => {
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
        name: "20% big",
        active: true,
        percent: 20,
        min_subtotal: 1000,
        schedule_type: "always",
        exclude_deals: false,
      },
    ];
    expect(
      discountFromRules(rules, [{ price: 2000, quantity: 1 }], day),
    ).toBe(400);
    expect(
      bestDiscountLabel(rules, [{ price: 2000, quantity: 1 }], day),
    ).toBe("20% big");
  });

  it("respects exclude_deals", () => {
    const day = new Date("2026-08-20T12:00:00+05:00");
    const lines = [
      { product_name: "Pizza", price: 800, quantity: 1, is_deal: false },
      { product_name: "Family Deal", price: 2000, quantity: 1, is_deal: true },
    ];
    const withExclude: DiscountRule = {
      name: "ex",
      active: true,
      percent: 10,
      min_subtotal: 1000,
      schedule_type: "always",
      exclude_deals: true,
    };
    expect(discountFromRules([withExclude], lines, day)).toBe(0);
    expect(
      discountFromRules([{ ...withExclude, exclude_deals: false }], lines, day),
    ).toBe(280);
  });

  it("matches single-day date_range", () => {
    const rule: DiscountRule = {
      name: "Eid",
      active: true,
      percent: 15,
      min_subtotal: 0,
      schedule_type: "date_range",
      start_date: "2026-08-20",
      end_date: "2026-08-20",
    };
    expect(ruleMatchesSchedule(rule, new Date("2026-08-20T18:00:00+05:00"))).toBe(
      true,
    );
    expect(ruleMatchesSchedule(rule, new Date("2026-08-21T12:00:00+05:00"))).toBe(
      false,
    );
  });

  it("picks strongest schedule-matching rule when cart below min", () => {
    const day = new Date("2026-08-13T12:00:00+05:00");
    const rules: DiscountRule[] = [
      {
        name: "Azaadi Discount",
        active: true,
        percent: 20,
        min_subtotal: 2000,
        schedule_type: "always",
        exclude_deals: true,
      },
      {
        name: "Fri & Sun 10% off",
        active: true,
        percent: 10,
        min_subtotal: 1000,
        schedule_type: "weekdays",
        weekdays_json: "[5,0]",
        exclude_deals: true,
      },
    ];
    const winner = bestMatchingRule(rules, day);
    expect(winner?.name).toBe("Azaadi Discount");
    expect(winner?.min_subtotal).toBe(2000);
  });
});
