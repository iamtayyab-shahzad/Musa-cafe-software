package service

import (
	"encoding/json"
	"testing"
	"time"

	"backend/internal/domain"
)

func TestParseFlexibleCalendarDay_YMDAndRFC3339(t *testing.T) {
	ymd, err := ParseFlexibleCalendarDay("2026-06-01")
	if err != nil || ymd == nil {
		t.Fatalf("ymd: %v %v", ymd, err)
	}
	if ymd.Format("2006-01-02") != "2026-06-01" {
		t.Fatalf("ymd day=%s", ymd.Format("2006-01-02"))
	}
	rfc, err := ParseFlexibleCalendarDay("2026-08-14T00:00:00+05:00")
	if err != nil || rfc == nil {
		t.Fatalf("rfc: %v %v", rfc, err)
	}
	if rfc.Format("2006-01-02") != "2026-08-14" {
		t.Fatalf("rfc day=%s", rfc.Format("2006-01-02"))
	}
	empty, err := ParseFlexibleCalendarDay("")
	if err != nil || empty != nil {
		t.Fatalf("empty: %v %v", empty, err)
	}
}

func TestRuleMatchesSchedule_Weekdays(t *testing.T) {
	end := time.Date(2026, 8, 31, 0, 0, 0, 0, karachiLoc)
	weekdays, _ := json.Marshal([]int{int(time.Friday), int(time.Sunday)})
	rule := domain.DiscountRule{
		Active:       true,
		Percent:      10,
		MinSubtotal:  1000,
		ScheduleType: ScheduleWeekdays,
		EndDate:      &end,
		WeekdaysJSON: string(weekdays),
	}

	friday := time.Date(2026, 8, 14, 12, 0, 0, 0, karachiLoc) // Friday
	saturday := time.Date(2026, 8, 15, 12, 0, 0, 0, karachiLoc)
	sunday := time.Date(2026, 8, 16, 12, 0, 0, 0, karachiLoc)
	afterEnd := time.Date(2026, 9, 4, 12, 0, 0, 0, karachiLoc) // Friday after end

	if !RuleMatchesSchedule(rule, friday) {
		t.Fatal("friday should match")
	}
	if RuleMatchesSchedule(rule, saturday) {
		t.Fatal("saturday should not match")
	}
	if !RuleMatchesSchedule(rule, sunday) {
		t.Fatal("sunday should match")
	}
	if RuleMatchesSchedule(rule, afterEnd) {
		t.Fatal("after end date should not match")
	}
}

func TestRuleMatchesSchedule_DateRangeSingleDay(t *testing.T) {
	day := time.Date(2026, 8, 20, 0, 0, 0, 0, karachiLoc)
	rule := domain.DiscountRule{
		Active:       true,
		Percent:      15,
		ScheduleType: ScheduleDateRange,
		StartDate:    &day,
		EndDate:      &day,
	}
	if !RuleMatchesSchedule(rule, day.Add(5*time.Hour)) {
		t.Fatal("same calendar day should match")
	}
	if RuleMatchesSchedule(rule, day.Add(24*time.Hour)) {
		t.Fatal("next day should not match")
	}
}

func TestDiscountFromRules_BestOf(t *testing.T) {
	day := time.Date(2026, 8, 20, 12, 0, 0, 0, karachiLoc)
	rules := []domain.DiscountRule{
		{Active: true, Percent: 10, MinSubtotal: 0, ScheduleType: ScheduleAlways},
		{Active: true, Percent: 20, MinSubtotal: 1000, ScheduleType: ScheduleAlways},
		{Active: true, Percent: 50, MinSubtotal: 5000, ScheduleType: ScheduleAlways},
	}
	if got := DiscountFromRules(rules, day, 2000, 2000); got != 400 {
		t.Fatalf("expected 400 (20%% of 2000), got %d", got)
	}
	if got := DiscountFromRules(rules, day, 6000, 6000); got != 3000 {
		t.Fatalf("expected 3000 (50%% of 6000), got %d", got)
	}
	if got := DiscountFromRules(rules, day, 500, 500); got != 50 {
		t.Fatalf("expected 50 (10%% of 500), got %d", got)
	}
}

func TestDiscountFromRules_ExcludeDeals(t *testing.T) {
	day := time.Date(2026, 8, 20, 12, 0, 0, 0, karachiLoc)
	rules := []domain.DiscountRule{
		{Active: true, Percent: 10, MinSubtotal: 1000, ScheduleType: ScheduleAlways, ExcludeDeals: true},
	}
	// all=3000, non-deal=800 → below min when excluding deals
	if got := DiscountFromRules(rules, day, 3000, 800); got != 0 {
		t.Fatalf("expected 0 when non-deal below min, got %d", got)
	}
	if got := DiscountFromRules(rules, day, 3000, 1200); got != 120 {
		t.Fatalf("expected 120 (10%% of 1200), got %d", got)
	}
	rules[0].ExcludeDeals = false
	if got := DiscountFromRules(rules, day, 3000, 800); got != 300 {
		t.Fatalf("expected 300 (10%% of full 3000), got %d", got)
	}
}

func TestDiscountFromRules_InactiveIgnored(t *testing.T) {
	day := time.Now()
	rules := []domain.DiscountRule{
		{Active: false, Percent: 90, MinSubtotal: 0, ScheduleType: ScheduleAlways},
	}
	if got := DiscountFromRules(rules, day, 1000, 1000); got != 0 {
		t.Fatalf("inactive rule should yield 0, got %d", got)
	}
}
