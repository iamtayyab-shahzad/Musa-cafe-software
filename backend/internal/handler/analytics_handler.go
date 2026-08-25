package handler

import (
	"net/http"
	"strings"

	"backend/internal/service"
	"backend/internal/utils"
	"github.com/gin-gonic/gin"
)

type AnalyticsHandler struct {
	service *service.AnalyticsService
}

func NewAnalyticsHandler(service *service.AnalyticsService) *AnalyticsHandler {
	return &AnalyticsHandler{service: service}
}

func (h *AnalyticsHandler) TodaySales(c *gin.Context) {
	total, err := h.service.TodaySales()
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "today sales", gin.H{"total": total})
}

func (h *AnalyticsHandler) YesterdaySales(c *gin.Context) {
	total, err := h.service.YesterdaySales()
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "yesterday sales", gin.H{"total": total})
}

func (h *AnalyticsHandler) WeeklySales(c *gin.Context) {
	total, err := h.service.WeeklySales()
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "weekly sales", gin.H{"total": total})
}

func (h *AnalyticsHandler) MonthlySales(c *gin.Context) {
	total, err := h.service.MonthlySales()
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "monthly sales", gin.H{"total": total})
}

// SalesPeriod handles GET /analytics/sales?date=YYYY-MM-DD
// or GET /analytics/sales?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive, Asia/Karachi).
func (h *AnalyticsHandler) SalesPeriod(c *gin.Context) {
	date := strings.TrimSpace(c.Query("date"))
	from := strings.TrimSpace(c.Query("from"))
	to := strings.TrimSpace(c.Query("to"))

	if date != "" {
		from, to = date, date
	} else if from == "" || to == "" {
		utils.Error(c, http.StatusBadRequest, "provide date=YYYY-MM-DD or from=&to=YYYY-MM-DD")
		return
	}

	result, err := h.service.SalesForPeriod(from, to)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "sales for period", gin.H{
		"total":       result.Total,
		"order_count": result.OrderCount,
		"from":        result.From.Format("2006-01-02"),
		"to":          result.To.Format("2006-01-02"),
		"items":       result.Items,
	})
}

func (h *AnalyticsHandler) BestSellingProducts(c *gin.Context) {
	data, err := h.service.BestSellingProducts()
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "best selling products", data)
}

func (h *AnalyticsHandler) CancelledOrders(c *gin.Context) {
	count, err := h.service.CancelledOrders()
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "cancelled orders", gin.H{"count": count})
}

func (h *AnalyticsHandler) PaymentBreakdown(c *gin.Context) {
	data, err := h.service.PaymentBreakdown()
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "payment breakdown", data)
}

func (h *AnalyticsHandler) RemainingInventory(c *gin.Context) {
	data, err := h.service.RemainingInventory()
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "remaining inventory", data)
}

func (h *AnalyticsHandler) LowStockItems(c *gin.Context) {
	data, err := h.service.LowStockItems()
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "low stock items", data)
}
