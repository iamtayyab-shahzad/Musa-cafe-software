/** Configurable discount rules (from Admin → API). Asia/Karachi schedules. */

export type DiscountRule = {
  id?: string;
  name: string;
  active: boolean;
  percent: number;
  min_subtotal: number;
  schedule_type: "always" | "date_range" | "weekdays" | string;
  start_date?: string | null;
  end_date?: string | null;
  weekdays_json?: string;
  weekdays?: number[];
  exclude_deals?: boolean;
};

export type PromoLine = {
  product_name?: string;
  price: number;
  quantity: number;
  is_deal?: boolean;
};

function karachiYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Go weekday: 0=Sunday … 6=Saturday */
function karachiWeekdayGo(date: Date): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    weekday: "short",
  })
    .formatToParts(date)
    .find((p) => p.type === "weekday")?.value;
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[short || ""] ?? -1;
}

function parseWeekdays(rule: DiscountRule): number[] {
  if (Array.isArray(rule.weekdays) && rule.weekdays.length) {
    return rule.weekdays;
  }
  const raw = (rule.weekdays_json || "").trim();
  if (!raw || raw === "[]") return [];
  try {
    const nums = JSON.parse(raw) as unknown;
    if (!Array.isArray(nums)) return [];
    return nums.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6);
  } catch {
    return [];
  }
}

function ymdOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return trimmed.slice(0, 10);
  return karachiYmd(d);
}

export function ruleMatchesSchedule(
  rule: DiscountRule,
  date = new Date(),
): boolean {
  const day = karachiYmd(date);
  const start = ymdOnly(rule.start_date);
  const end = ymdOnly(rule.end_date);
  const type = (rule.schedule_type || "always").toLowerCase();

  if (type === "always") {
    if (start && day < start) return false;
    if (end && day > end) return false;
    return true;
  }

  if (type === "date_range") {
    if (!start || !end) return false;
    const a = start <= end ? start : end;
    const b = start <= end ? end : start;
    return day >= a && day <= b;
  }

  if (type === "weekdays") {
    const days = parseWeekdays(rule);
    if (!days.length) return false;
    if (start && day < start) return false;
    if (end && day > end) return false;
    return days.includes(karachiWeekdayGo(date));
  }

  return false;
}

export function isDealLineName(name: string | undefined | null): boolean {
  const n = (name || "").toLowerCase();
  return n.includes("deal") || n.includes("mega combo");
}

export function eligiblePromoSubtotal(lines: PromoLine[]): number {
  return lines.reduce((sum, line) => {
    const deal =
      line.is_deal === true ||
      (line.is_deal !== false && isDealLineName(line.product_name));
    if (deal) return sum;
    return sum + line.price * line.quantity;
  }, 0);
}

function fullSubtotal(lines: PromoLine[]): number {
  return lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
}

function amountForRule(rule: DiscountRule, eligible: number): number {
  if (!rule.active || rule.percent < 1 || rule.percent > 100) return 0;
  if (eligible < (rule.min_subtotal || 0)) return 0;
  return Math.floor((eligible * rule.percent) / 100);
}

function eligibleForRule(rule: DiscountRule, lines: PromoLine[]): number {
  if (rule.exclude_deals === false) return fullSubtotal(lines);
  return eligiblePromoSubtotal(lines);
}

/** Best (max Rs) discount among matching rules. */
export function discountFromRules(
  rules: DiscountRule[],
  lines: PromoLine[],
  date = new Date(),
): number {
  let best = 0;
  for (const rule of rules) {
    if (!rule.active) continue;
    if (!ruleMatchesSchedule(rule, date)) continue;
    const amt = amountForRule(rule, eligibleForRule(rule, lines));
    if (amt > best) best = amt;
  }
  return best;
}

export function bestDiscountLabel(
  rules: DiscountRule[],
  lines: PromoLine[],
  date = new Date(),
): string | null {
  return bestMatchingRule(rules, date, lines)?.name || null;
}

/**
 * Winning rule for the cart (max Rs), or if nothing qualifies yet,
 * the strongest schedule-matching rule today (highest %).
 */
export function bestMatchingRule(
  rules: DiscountRule[],
  date = new Date(),
  lines?: PromoLine[],
): DiscountRule | null {
  if (lines && lines.length > 0) {
    let bestAmt = 0;
    let winner: DiscountRule | null = null;
    for (const rule of rules) {
      if (!rule.active || !ruleMatchesSchedule(rule, date)) continue;
      const amt = amountForRule(rule, eligibleForRule(rule, lines));
      if (amt > bestAmt) {
        bestAmt = amt;
        winner = rule;
      }
    }
    if (winner) return winner;
  }

  let best: DiscountRule | null = null;
  for (const rule of rules) {
    if (!rule.active || !ruleMatchesSchedule(rule, date)) continue;
    if (
      !best ||
      rule.percent > best.percent ||
      (rule.percent === best.percent &&
        (rule.min_subtotal || 0) < (best.min_subtotal || 0))
    ) {
      best = rule;
    }
  }
  return best;
}

export function anyRuleMatchesToday(
  rules: DiscountRule[],
  date = new Date(),
): boolean {
  return rules.some((r) => r.active && ruleMatchesSchedule(r, date));
}

let cachedRules: DiscountRule[] = [];

/** Update in-memory rules (from API / POS cache). */
export function setDiscountRulesCache(rules: DiscountRule[]) {
  cachedRules = Array.isArray(rules) ? rules.filter((r) => r.active) : [];
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("discount-rules-updated"));
  }
}

export function getDiscountRulesCache(): DiscountRule[] {
  return cachedRules;
}

export type ActivePromoInfo = {
  name: string;
  min_subtotal: number;
  percent: number;
};

export function activePromoInfo(
  lines?: PromoLine[],
  date = new Date(),
): ActivePromoInfo | null {
  const rule = bestMatchingRule(cachedRules, date, lines);
  if (!rule?.name) return null;
  return {
    name: rule.name,
    min_subtotal: rule.min_subtotal || 0,
    percent: rule.percent,
  };
}

export function isWeekendPromoDay(date = new Date()): boolean {
  return anyRuleMatchesToday(cachedRules, date);
}

export function weekendDiscount(lines: PromoLine[], date = new Date()): number {
  return discountFromRules(cachedRules, lines, date);
}

export function weekendPromoLabel(
  linesOrDate?: PromoLine[] | Date,
  date = new Date(),
): string | null {
  if (linesOrDate instanceof Date) {
    return activePromoInfo(undefined, linesOrDate)?.name || null;
  }
  if (Array.isArray(linesOrDate)) {
    return (
      bestDiscountLabel(cachedRules, linesOrDate, date) ||
      activePromoInfo(linesOrDate, date)?.name ||
      null
    );
  }
  return activePromoInfo(undefined, date)?.name || null;
}
