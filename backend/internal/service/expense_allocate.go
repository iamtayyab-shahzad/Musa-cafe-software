package service

import (
	"math"
	"strings"
	"time"

	"backend/internal/domain"
)

// dateOnly truncates t to midnight in loc.
func dateOnly(t time.Time, loc *time.Location) time.Time {
	t = t.In(loc)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
}

// calendarDays returns the number of midnights from start (inclusive) to end (exclusive).
func calendarDays(start, end time.Time) int {
	if !end.After(start) {
		return 0
	}
	return int(end.Sub(start).Hours() / 24)
}

// AllocateExpense returns how much of one expense row belongs to [start, end).
//
// Rules (shop-safe, no double-count within one row):
//   - NONE: full amount only if expense_date falls inside the window
//   - DAILY: amount × overlapping days after the expense starts
//   - WEEKLY: amount prorated by overlappingDays/7
//   - MONTHLY: amount prorated by overlappingDays/daysInEachCalendarMonth
//   - YEARLY: amount prorated by overlappingDays/365
//
// Recurring rows apply from expense_date forward. Enter rent ONCE as MONTHLY —
// do not also log a separate NONE row for the same bill in that month.
func AllocateExpense(amount int, recurrence string, expenseDate, start, end time.Time) int {
	if amount <= 0 || !end.After(start) {
		return 0
	}
	loc := start.Location()
	expDay := dateOnly(expenseDate, loc)
	periodStart := dateOnly(start, loc)
	periodEnd := dateOnly(end, loc)
	// If end has a time component past midnight, dateOnly(end) can equal
	// dateOnly(start) for a same-day window; keep exclusive end as next day.
	if end.After(periodEnd) {
		periodEnd = periodEnd.AddDate(0, 0, 1)
	}
	if !periodEnd.After(periodStart) {
		return 0
	}

	rec := strings.ToUpper(strings.TrimSpace(recurrence))
	if rec == "" {
		rec = domain.RecurrenceNone
	}

	switch rec {
	case domain.RecurrenceNone:
		if !expDay.Before(periodStart) && expDay.Before(periodEnd) {
			return amount
		}
		return 0

	case domain.RecurrenceDaily, domain.RecurrenceWeekly, domain.RecurrenceMonthly, domain.RecurrenceYearly:
		from := periodStart
		if expDay.After(from) {
			from = expDay
		}
		if !from.Before(periodEnd) {
			return 0
		}

		switch rec {
		case domain.RecurrenceDaily:
			return amount * calendarDays(from, periodEnd)

		case domain.RecurrenceWeekly:
			days := calendarDays(from, periodEnd)
			return int(math.Round(float64(amount) * float64(days) / 7.0))

		case domain.RecurrenceYearly:
			days := calendarDays(from, periodEnd)
			return int(math.Round(float64(amount) * float64(days) / 365.0))

		case domain.RecurrenceMonthly:
			total := 0.0
			cur := from
			for cur.Before(periodEnd) {
				monthStart := time.Date(cur.Year(), cur.Month(), 1, 0, 0, 0, 0, loc)
				nextMonth := monthStart.AddDate(0, 1, 0)
				segEnd := periodEnd
				if nextMonth.Before(segEnd) {
					segEnd = nextMonth
				}
				segDays := calendarDays(cur, segEnd)
				dim := calendarDays(monthStart, nextMonth)
				if dim > 0 && segDays > 0 {
					total += float64(amount) * float64(segDays) / float64(dim)
				}
				cur = segEnd
			}
			return int(math.Round(total))
		}
	}

	// Unknown recurrence → treat as one-off
	if !expDay.Before(periodStart) && expDay.Before(periodEnd) {
		return amount
	}
	return 0
}

// SumAllocatedExpenses sums AllocateExpense over rows.
func SumAllocatedExpenses(rows []domain.Expense, start, end time.Time) int {
	total := 0
	for _, e := range rows {
		total += AllocateExpense(e.Amount, e.Recurrence, e.ExpenseDate, start, end)
	}
	return total
}

// BreakdownAllocatedExpenses groups allocated amounts by category.
func BreakdownAllocatedExpenses(rows []domain.Expense, start, end time.Time) []ExpenseBucket {
	byCat := map[string]int{}
	order := []string{}
	for _, e := range rows {
		n := AllocateExpense(e.Amount, e.Recurrence, e.ExpenseDate, start, end)
		if n == 0 {
			continue
		}
		cat := e.Category
		if cat == "" {
			cat = "Other"
		}
		if _, ok := byCat[cat]; !ok {
			order = append(order, cat)
		}
		byCat[cat] += n
	}
	out := make([]ExpenseBucket, 0, len(order))
	for _, cat := range order {
		out = append(out, ExpenseBucket{Category: cat, Total: byCat[cat]})
	}
	return out
}
