package handler

import (
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func businessLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Karachi")
	if err != nil {
		return time.FixedZone("PKT", 5*3600)
	}
	return loc
}

// parseDateRange reads ?start=&end= (YYYY-MM-DD) or ?range=today|week|month.
// All windows use Asia/Karachi. Week is Monday 00:00 → next Monday 00:00.
// Defaults to the current calendar month when nothing is provided.
func parseDateRange(c *gin.Context) (time.Time, time.Time, error) {
	loc := businessLocation()
	now := time.Now().In(loc)

	if r := strings.ToLower(strings.TrimSpace(c.Query("range"))); r != "" {
		startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
		switch r {
		case "today", "daily":
			return startOfDay, startOfDay.AddDate(0, 0, 1), nil
		case "week", "weekly":
			// Monday-start calendar week
			weekday := int(now.Weekday()) // Sunday=0
			offset := (weekday + 6) % 7    // Monday=0
			start := startOfDay.AddDate(0, 0, -offset)
			return start, start.AddDate(0, 0, 7), nil
		case "month", "monthly":
			start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
			return start, start.AddDate(0, 1, 0), nil
		case "yesterday":
			y := startOfDay.AddDate(0, 0, -1)
			return y, startOfDay, nil
		}
	}

	startRaw := strings.TrimSpace(c.Query("start"))
	endRaw := strings.TrimSpace(c.Query("end"))
	if startRaw == "" && endRaw == "" {
		start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
		return start, start.AddDate(0, 1, 0), nil
	}

	parse := func(raw string, endOfDay bool) (time.Time, error) {
		t, err := time.ParseInLocation("2006-01-02", raw, loc)
		if err != nil {
			return time.Time{}, fmt.Errorf("invalid date %q (use YYYY-MM-DD)", raw)
		}
		if endOfDay {
			return t.AddDate(0, 0, 1), nil
		}
		return t, nil
	}

	var start, end time.Time
	var err error
	if startRaw != "" {
		start, err = parse(startRaw, false)
		if err != nil {
			return time.Time{}, time.Time{}, err
		}
	} else {
		start = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
	}
	if endRaw != "" {
		end, err = parse(endRaw, true)
		if err != nil {
			return time.Time{}, time.Time{}, err
		}
	} else {
		end = start.AddDate(0, 1, 0)
	}
	if !end.After(start) {
		return time.Time{}, time.Time{}, fmt.Errorf("end date must be after start date")
	}
	return start, end, nil
}

// parseOptionalCreatedRange reads optional ?start=&end= (YYYY-MM-DD) in
// Asia/Karachi. Both omitted → nil range (no date filter). end is exclusive
// (day after the selected end date). Unlike parseDateRange, it does not
// default to the current month.
func parseOptionalCreatedRange(c *gin.Context) (from, to *time.Time, err error) {
	startRaw := strings.TrimSpace(c.Query("start"))
	endRaw := strings.TrimSpace(c.Query("end"))
	if startRaw == "" && endRaw == "" {
		return nil, nil, nil
	}
	loc := businessLocation()
	parseDay := func(raw string) (time.Time, error) {
		return time.ParseInLocation("2006-01-02", raw, loc)
	}
	if startRaw != "" {
		t, e := parseDay(startRaw)
		if e != nil {
			return nil, nil, fmt.Errorf("invalid start date (use YYYY-MM-DD)")
		}
		from = &t
	}
	if endRaw != "" {
		t, e := parseDay(endRaw)
		if e != nil {
			return nil, nil, fmt.Errorf("invalid end date (use YYYY-MM-DD)")
		}
		excl := t.AddDate(0, 0, 1)
		to = &excl
	}
	if from != nil && to != nil && !to.After(*from) {
		return nil, nil, fmt.Errorf("end date must be on or after start date")
	}
	return from, to, nil
}
