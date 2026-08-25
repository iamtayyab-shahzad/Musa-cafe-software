package service

import (
	"net/http"
	"strings"
	"time"

	"backend/internal/domain"
	"backend/internal/repository"
	"backend/internal/utils"

	"gorm.io/gorm"
)

type AnalyticsService struct {
	repo *repository.AnalyticsRepository
}

func NewAnalyticsService(db *gorm.DB) *AnalyticsService {
	return &AnalyticsService{repo: repository.NewAnalyticsRepository(db)}
}

// businessDayRange returns [start, end) for the calendar day in Asia/Karachi
// (midnight 12:00 AM → next midnight), not restaurant opening hours.
func businessDayRange(now time.Time) (time.Time, time.Time) {
	loc := karachiLoc
	if loc == nil {
		loc = time.FixedZone("PKT", 5*3600)
	}
	local := now.In(loc)
	start := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	return start, start.Add(24 * time.Hour)
}

func (s *AnalyticsService) TodaySales() (int, error) {
	start, end := businessDayRange(time.Now())
	return s.repo.SalesBetween(start, end)
}

func (s *AnalyticsService) YesterdaySales() (int, error) {
	start, end := businessDayRange(time.Now())
	start = start.Add(-24 * time.Hour)
	end = end.Add(-24 * time.Hour)
	return s.repo.SalesBetween(start, end)
}

// SalesPeriodItem is one product's sold qty/revenue inside a lookup window.
type SalesPeriodItem struct {
	ProductID   string `json:"product_id"`
	ProductName string `json:"product_name"`
	Quantity    int    `json:"quantity"`
	Revenue     int    `json:"revenue"`
}

// SalesPeriodResult is completed sales for a Karachi calendar day or inclusive range.
type SalesPeriodResult struct {
	Total      int               `json:"total"`
	OrderCount int64             `json:"order_count"`
	From       time.Time         `json:"from"`
	To         time.Time         `json:"to"`
	Items      []SalesPeriodItem `json:"items"`
}

// SalesForPeriod returns sales for [fromDate, toDate] inclusive (YYYY-MM-DD, Asia/Karachi).
func (s *AnalyticsService) SalesForPeriod(fromDate, toDate string) (*SalesPeriodResult, error) {
	start, err := parseKarachiDate(fromDate)
	if err != nil {
		return nil, utils.NewAppError(http.StatusBadRequest, "invalid from/date (use YYYY-MM-DD)")
	}
	endDay, err := parseKarachiDate(toDate)
	if err != nil {
		return nil, utils.NewAppError(http.StatusBadRequest, "invalid to date (use YYYY-MM-DD)")
	}
	if endDay.Before(start) {
		return nil, utils.NewAppError(http.StatusBadRequest, "to date must be on or after from date")
	}
	end := endDay.Add(24 * time.Hour)
	total, count, err := s.repo.SalesSummaryBetween(start, end)
	if err != nil {
		return nil, err
	}
	rawItems, err := s.repo.ItemSalesBetween(start, end)
	if err != nil {
		return nil, err
	}
	items := make([]SalesPeriodItem, 0, len(rawItems))
	for _, row := range rawItems {
		items = append(items, SalesPeriodItem{
			ProductID:   asString(row["product_id"]),
			ProductName: asString(row["product_name"]),
			Quantity:    asInt(row["quantity"]),
			Revenue:     asInt(row["revenue"]),
		})
	}
	return &SalesPeriodResult{
		Total:      total,
		OrderCount: count,
		From:       start,
		To:         endDay,
		Items:      items,
	}, nil
}

func asString(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	default:
		return ""
	}
}

func asInt(v any) int {
	switch t := v.(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	default:
		return 0
	}
}

func parseKarachiDate(value string) (time.Time, error) {
	loc := karachiLoc
	if loc == nil {
		loc = time.FixedZone("PKT", 5*3600)
	}
	t, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(value), loc)
	if err != nil {
		return time.Time{}, err
	}
	return t, nil
}

func (s *AnalyticsService) WeeklySales() (int, error) {
	now := time.Now()
	start := now.AddDate(0, 0, -7)
	return s.repo.SalesBetween(start, now)
}

func (s *AnalyticsService) MonthlySales() (int, error) {
	now := time.Now()
	start := now.AddDate(0, -1, 0)
	return s.repo.SalesBetween(start, now)
}

func (s *AnalyticsService) CancelledOrders() (int64, error) {
	return s.repo.CancelledOrdersCount()
}

func (s *AnalyticsService) PaymentBreakdown() ([]map[string]any, error) {
	return s.repo.PaymentBreakdown()
}

func (s *AnalyticsService) BestSellingProducts() ([]map[string]any, error) {
	return s.repo.BestSellingProducts(10)
}

func (s *AnalyticsService) RemainingInventory() (any, error) {
	return s.repo.RemainingInventory()
}

func (s *AnalyticsService) LowStockItems() ([]domain.Inventory, error) {
	return s.repo.LowStockInventory()
}
