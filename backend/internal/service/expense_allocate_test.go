package service

import (
	"testing"
	"time"

	"backend/internal/domain"
)

func karachi() *time.Location {
	loc, err := time.LoadLocation("Asia/Karachi")
	if err != nil {
		return time.FixedZone("PKT", 5*3600)
	}
	return loc
}

func d(loc *time.Location, y int, m time.Month, day int) time.Time {
	return time.Date(y, m, day, 0, 0, 0, 0, loc)
}

func TestAllocateExpense_None(t *testing.T) {
	loc := karachi()
	start, end := d(loc, 2026, 8, 1), d(loc, 2026, 9, 1)
	got := AllocateExpense(5000, domain.RecurrenceNone, d(loc, 2026, 8, 10), start, end)
	if got != 5000 {
		t.Fatalf("in-range NONE: want 5000 got %d", got)
	}
	got = AllocateExpense(5000, domain.RecurrenceNone, d(loc, 2026, 7, 31), start, end)
	if got != 0 {
		t.Fatalf("before-range NONE: want 0 got %d", got)
	}
}

func TestAllocateExpense_WeeklyFullWeek(t *testing.T) {
	loc := karachi()
	// Mon 3 Aug → Mon 10 Aug (7 days)
	start, end := d(loc, 2026, 8, 3), d(loc, 2026, 8, 10)
	got := AllocateExpense(7000, domain.RecurrenceWeekly, d(loc, 2026, 1, 1), start, end)
	if got != 7000 {
		t.Fatalf("full week WEEKLY: want 7000 got %d", got)
	}
}

func TestAllocateExpense_MonthlyFullMonth(t *testing.T) {
	loc := karachi()
	start, end := d(loc, 2026, 8, 1), d(loc, 2026, 9, 1)
	got := AllocateExpense(80000, domain.RecurrenceMonthly, d(loc, 2026, 1, 1), start, end)
	if got != 80000 {
		t.Fatalf("full August MONTHLY: want 80000 got %d", got)
	}
}

func TestAllocateExpense_MonthlyProratedWeek(t *testing.T) {
	loc := karachi()
	// 7 days in 31-day August → round(80000 * 7/31) = 18065
	start, end := d(loc, 2026, 8, 3), d(loc, 2026, 8, 10)
	got := AllocateExpense(80000, domain.RecurrenceMonthly, d(loc, 2026, 1, 1), start, end)
	if got != 18065 {
		t.Fatalf("week MONTHLY share: want 18065 got %d", got)
	}
}

func TestAllocateExpense_StartsMidPeriod(t *testing.T) {
	loc := karachi()
	start, end := d(loc, 2026, 8, 1), d(loc, 2026, 9, 1)
	// Daily helper starts Aug 25 → 7 days in August
	got := AllocateExpense(1000, domain.RecurrenceDaily, d(loc, 2026, 8, 25), start, end)
	if got != 7000 {
		t.Fatalf("DAILY mid-month: want 7000 got %d", got)
	}
}

func TestAllocateExpense_FutureStartIgnored(t *testing.T) {
	loc := karachi()
	start, end := d(loc, 2026, 8, 1), d(loc, 2026, 9, 1)
	got := AllocateExpense(80000, domain.RecurrenceMonthly, d(loc, 2026, 10, 1), start, end)
	if got != 0 {
		t.Fatalf("future MONTHLY: want 0 got %d", got)
	}
}

func TestSumAllocated_NoDoubleCountNoneAndMonthlySameBill(t *testing.T) {
	// Documented shop rule: one MONTHLY row only. This test proves TWO rows
	// (NONE + MONTHLY) WOULD double — so UI must warn; allocation itself is correct per row.
	loc := karachi()
	start, end := d(loc, 2026, 8, 1), d(loc, 2026, 9, 1)
	rows := []domain.Expense{
		{Amount: 80000, Recurrence: domain.RecurrenceMonthly, ExpenseDate: d(loc, 2026, 1, 1), Category: "Rent"},
		{Amount: 80000, Recurrence: domain.RecurrenceNone, ExpenseDate: d(loc, 2026, 8, 5), Category: "Rent"},
	}
	got := SumAllocatedExpenses(rows, start, end)
	if got != 160000 {
		t.Fatalf("duplicate rent rows correctly sum to 160000 (warn in UI), got %d", got)
	}
}

func TestBreakdownAllocated(t *testing.T) {
	loc := karachi()
	start, end := d(loc, 2026, 8, 3), d(loc, 2026, 8, 10)
	rows := []domain.Expense{
		{Amount: 7000, Recurrence: domain.RecurrenceWeekly, ExpenseDate: d(loc, 2026, 1, 1), Category: "Salaries"},
		{Amount: 80000, Recurrence: domain.RecurrenceMonthly, ExpenseDate: d(loc, 2026, 1, 1), Category: "Rent"},
	}
	b := BreakdownAllocatedExpenses(rows, start, end)
	if len(b) != 2 {
		t.Fatalf("want 2 buckets, got %d", len(b))
	}
	total := 0
	for _, x := range b {
		total += x.Total
	}
	if total != 7000+18065 {
		t.Fatalf("breakdown total want %d got %d", 7000+18065, total)
	}
}
