package service

import (
	"encoding/json"
	"strings"
	"time"

	"backend/internal/domain"

	"github.com/google/uuid"
)

var (
	dealsCategoryID = uuid.MustParse("10000000-0000-4000-8000-000000000001")
	karachiLoc      *time.Location
)

func init() {
	loc, err := time.LoadLocation("Asia/Karachi")
	if err != nil {
		loc = time.FixedZone("PKT", 5*3600)
	}
	karachiLoc = loc
}

func isDealProduct(p domain.Product) bool {
	if p.CategoryID == dealsCategoryID {
		return true
	}
	cat := strings.ToLower(strings.TrimSpace(p.Category.Name))
	if strings.Contains(cat, "deal") {
		return true
	}
	name := strings.ToLower(p.Name)
	return strings.Contains(name, "deal") || strings.Contains(name, "mega combo")
}

const (
	ScheduleAlways    = "always"
	ScheduleDateRange = "date_range"
	ScheduleWeekdays  = "weekdays"
)

func parseWeekdaysJSON(raw string) []time.Weekday {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "[]" {
		return nil
	}
	var nums []int
	if err := json.Unmarshal([]byte(raw), &nums); err != nil {
		return nil
	}
	out := make([]time.Weekday, 0, len(nums))
	for _, n := range nums {
		if n < 0 || n > 6 {
			continue
		}
		out = append(out, time.Weekday(n))
	}
	return out
}

func karachiDateOnly(t time.Time) time.Time {
	loc := karachiLoc
	if loc == nil {
		loc = time.FixedZone("PKT", 5*3600)
	}
	local := t.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
}

// ParseFlexibleCalendarDay accepts RFC3339 or plain YYYY-MM-DD and returns
// a Karachi calendar-day timestamp (midnight). Empty string → (nil, nil).
func ParseFlexibleCalendarDay(raw string) (*time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		ymd := raw
		if len(raw) >= 10 {
			ymd = raw[:10]
		}
		loc := karachiLoc
		if loc == nil {
			loc = time.FixedZone("PKT", 5*3600)
		}
		t, err = time.ParseInLocation("2006-01-02", ymd, loc)
	}
	if err != nil {
		return nil, err
	}
	day := karachiDateOnly(t)
	return &day, nil
}

// RuleMatchesSchedule reports whether saleTime falls in the rule window (Asia/Karachi).
func RuleMatchesSchedule(rule domain.DiscountRule, saleTime time.Time) bool {
	day := karachiDateOnly(saleTime)

	switch rule.ScheduleType {
	case ScheduleAlways:
		if rule.StartDate != nil {
			start := karachiDateOnly(*rule.StartDate)
			if day.Before(start) {
				return false
			}
		}
		if rule.EndDate != nil {
			end := karachiDateOnly(*rule.EndDate)
			if day.After(end) {
				return false
			}
		}
		return true

	case ScheduleDateRange:
		if rule.StartDate == nil || rule.EndDate == nil {
			return false
		}
		start := karachiDateOnly(*rule.StartDate)
		end := karachiDateOnly(*rule.EndDate)
		if end.Before(start) {
			start, end = end, start
		}
		return !day.Before(start) && !day.After(end)

	case ScheduleWeekdays:
		days := parseWeekdaysJSON(rule.WeekdaysJSON)
		if len(days) == 0 {
			return false
		}
		if rule.StartDate != nil {
			start := karachiDateOnly(*rule.StartDate)
			if day.Before(start) {
				return false
			}
		}
		if rule.EndDate != nil {
			end := karachiDateOnly(*rule.EndDate)
			if day.After(end) {
				return false
			}
		}
		wd := day.Weekday()
		for _, d := range days {
			if d == wd {
				return true
			}
		}
		return false

	default:
		return false
	}
}

func discountAmountForRule(rule domain.DiscountRule, eligibleSubtotal int) int {
	if !rule.Active || rule.Percent <= 0 || rule.Percent > 100 {
		return 0
	}
	if eligibleSubtotal < rule.MinSubtotal {
		return 0
	}
	return (eligibleSubtotal * rule.Percent) / 100
}

func eligibleForRule(rule domain.DiscountRule, allSubtotal, nonDealSubtotal int) int {
	if rule.ExcludeDeals {
		return nonDealSubtotal
	}
	return allSubtotal
}

// DiscountFromRules returns the best (max rupee) discount among matching active rules.
// allSubtotal is every line; nonDealSubtotal excludes flyer/deal products.
func DiscountFromRules(rules []domain.DiscountRule, saleTime time.Time, allSubtotal, nonDealSubtotal int) int {
	best := 0
	for _, rule := range rules {
		if !rule.Active {
			continue
		}
		if !RuleMatchesSchedule(rule, saleTime) {
			continue
		}
		amt := discountAmountForRule(rule, eligibleForRule(rule, allSubtotal, nonDealSubtotal))
		if amt > best {
			best = amt
		}
	}
	return best
}

// BestDiscountLabel returns a short UI label for the winning rule, or empty.
func BestDiscountLabel(rules []domain.DiscountRule, saleTime time.Time, allSubtotal, nonDealSubtotal int) string {
	best := 0
	label := ""
	for _, rule := range rules {
		if !rule.Active || !RuleMatchesSchedule(rule, saleTime) {
			continue
		}
		amt := discountAmountForRule(rule, eligibleForRule(rule, allSubtotal, nonDealSubtotal))
		if amt > best {
			best = amt
			label = rule.Name
		}
	}
	return label
}
