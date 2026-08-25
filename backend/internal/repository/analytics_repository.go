package repository

import (
	"time"

	"backend/internal/domain"

	"gorm.io/gorm"
)

type AnalyticsRepository struct {
	db *gorm.DB
}

func NewAnalyticsRepository(db *gorm.DB) *AnalyticsRepository {
	return &AnalyticsRepository{db: db}
}

func (r *AnalyticsRepository) SalesBetween(start, end time.Time) (int, error) {
	var total int
	err := r.db.Model(&domain.Order{}).
		Where("order_status = ? AND created_at >= ? AND created_at < ?", "COMPLETED", start, end).
		Select("COALESCE(SUM(grand_total), 0)").
		Scan(&total).Error
	return total, err
}

// SalesSummaryBetween returns completed-order sales total and count in [start, end).
func (r *AnalyticsRepository) SalesSummaryBetween(start, end time.Time) (total int, count int64, err error) {
	type row struct {
		Total int
		Count int64
	}
	var result row
	err = r.db.Model(&domain.Order{}).
		Where("order_status = ? AND created_at >= ? AND created_at < ?", "COMPLETED", start, end).
		Select("COALESCE(SUM(grand_total), 0) AS total, COUNT(*) AS count").
		Scan(&result).Error
	return result.Total, result.Count, err
}

func (r *AnalyticsRepository) CancelledOrdersCount() (int64, error) {
	var count int64
	err := r.db.Model(&domain.Order{}).Where("order_status = ?", "CANCELLED").Count(&count).Error
	return count, err
}

func (r *AnalyticsRepository) PaymentBreakdown() ([]map[string]any, error) {
	type row struct {
		Method string
		Total  int
	}
	var rows []row
	// Only count payments that belong to COMPLETED orders. A payment row can be
	// created/marked paid independently, so joining on the order status keeps the
	// breakdown consistent with the sales totals (which also require COMPLETED).
	err := r.db.Model(&domain.Payment{}).
		Select("payments.method as method, COALESCE(SUM(payments.amount), 0) as total").
		Joins("JOIN orders ON orders.id = payments.order_id").
		Where("payments.status = ? AND orders.order_status = ?", "paid", "COMPLETED").
		Group("payments.method").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make([]map[string]any, 0, len(rows))
	for _, rrow := range rows {
		result = append(result, map[string]any{"method": rrow.Method, "total": rrow.Total})
	}
	return result, nil
}

func (r *AnalyticsRepository) BestSellingProducts(limit int) ([]map[string]any, error) {
	type row struct {
		ProductID   string
		ProductName string
		Quantity    int
	}
	var rows []row
	err := r.db.Table("order_items").
		Select("order_items.product_id, COALESCE(products.name, '') as product_name, COALESCE(SUM(order_items.quantity), 0) as quantity").
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Joins("LEFT JOIN products ON products.id = order_items.product_id").
		Where("orders.order_status = ?", "COMPLETED").
		Group("order_items.product_id, products.name").
		Order("quantity desc").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make([]map[string]any, 0, len(rows))
	for _, rrow := range rows {
		result = append(result, map[string]any{
			"product_id":   rrow.ProductID,
			"product_name": rrow.ProductName,
			"quantity":     rrow.Quantity,
		})
	}
	return result, nil
}

// ItemSalesBetween returns every product sold on COMPLETED orders in [start, end),
// ordered by quantity descending. Used by cloud sales lookup for a day/range.
func (r *AnalyticsRepository) ItemSalesBetween(start, end time.Time) ([]map[string]any, error) {
	type row struct {
		ProductID   string
		ProductName string
		Quantity    int
		Revenue     int
	}
	var rows []row
	err := r.db.Table("order_items").
		Select(`order_items.product_id::text as product_id,
			COALESCE(products.name, '') as product_name,
			COALESCE(SUM(order_items.quantity), 0) as quantity,
			COALESCE(SUM(order_items.price * order_items.quantity), 0) as revenue`).
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Joins("LEFT JOIN products ON products.id = order_items.product_id").
		Where("orders.order_status = ? AND orders.created_at >= ? AND orders.created_at < ?",
			"COMPLETED", start, end).
		Group("order_items.product_id, products.name").
		Order("quantity desc").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make([]map[string]any, 0, len(rows))
	for _, rrow := range rows {
		result = append(result, map[string]any{
			"product_id":   rrow.ProductID,
			"product_name": rrow.ProductName,
			"quantity":     rrow.Quantity,
			"revenue":      rrow.Revenue,
		})
	}
	return result, nil
}

func (r *AnalyticsRepository) RemainingInventory() ([]domain.Inventory, error) {
	var inv []domain.Inventory
	if err := r.db.Order("stock asc").Find(&inv).Error; err != nil {
		return nil, err
	}
	return inv, nil
}

func (r *AnalyticsRepository) LowStockInventory() ([]domain.Inventory, error) {
	var inv []domain.Inventory
	if err := r.db.
		Where("stock <= minimum_stock").
		Order("stock asc").
		Find(&inv).Error; err != nil {
		return nil, err
	}
	return inv, nil
}
