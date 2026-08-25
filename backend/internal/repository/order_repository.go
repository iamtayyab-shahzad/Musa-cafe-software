package repository

import (
	"strings"
	"time"

	"backend/internal/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type OrderRepository struct {
	db *gorm.DB
}

func NewOrderRepository(db *gorm.DB) *OrderRepository {
	return &OrderRepository{db: db}
}

func orderListProductSelectColumns() []string {
	return []string{"id", "name", "category_id", "available"}
}

func orderDetailProductSelectColumns() []string {
	return []string{"id", "name", "image", "category_id", "available"}
}

func selectProductColumns(db *gorm.DB, cols []string) *gorm.DB {
	switch len(cols) {
	case 4:
		return db.Select(cols[0], cols[1], cols[2], cols[3])
	case 5:
		return db.Select(cols[0], cols[1], cols[2], cols[3], cols[4])
	default:
		return db
	}
}

// orderListPreloads attaches relations for list/summary endpoints (pending,
// history, phone/walk-in lists). Product image is omitted — clients cache
// catalog images locally; omitting image avoids re-sending base64 blobs on polls.
func orderListPreloads(q *gorm.DB) *gorm.DB {
	return q.
		Preload("Items").
		Preload("Items.Product", func(db *gorm.DB) *gorm.DB {
			return selectProductColumns(db, orderListProductSelectColumns())
		}).
		Preload("Items.ProductSize", func(db *gorm.DB) *gorm.DB {
			return db.Select("id", "product_id", "size", "price")
		}).
		Preload("Customer", func(db *gorm.DB) *gorm.DB {
			return db.Select("id", "name", "phone")
		}).
		Preload("Payment").
		Preload("Location", func(db *gorm.DB) *gorm.DB {
			return db.Select("id", "name", "delivery_charge")
		})
}

// orderDetailPreloads is used for single-order fetches (GET by id / client id).
func orderDetailPreloads(q *gorm.DB) *gorm.DB {
	return q.
		Preload("Items").
		Preload("Items.Product", func(db *gorm.DB) *gorm.DB {
			return selectProductColumns(db, orderDetailProductSelectColumns())
		}).
		Preload("Items.ProductSize", func(db *gorm.DB) *gorm.DB {
			return db.Select("id", "product_id", "size", "price")
		}).
		Preload("Customer", func(db *gorm.DB) *gorm.DB {
			return db.Select("id", "name", "phone")
		}).
		Preload("Payment").
		Preload("Location", func(db *gorm.DB) *gorm.DB {
			return db.Select("id", "name", "delivery_charge")
		})
}

func (r *OrderRepository) Create(tx *gorm.DB, order *domain.Order) error {
	return tx.Create(order).Error
}

func (r *OrderRepository) GetByClientOrderID(clientOrderID uuid.UUID) (*domain.Order, error) {
	var order domain.Order
	if err := orderDetailPreloads(r.db).
		Where("client_order_id = ?", clientOrderID).
		First(&order).Error; err != nil {
		return nil, err
	}
	return &order, nil
}

func (r *OrderRepository) GetByID(id uuid.UUID) (*domain.Order, error) {
	return r.GetByIDTx(r.db, id)
}

func (r *OrderRepository) GetByIDTx(tx *gorm.DB, id uuid.UUID) (*domain.Order, error) {
	var order domain.Order
	if err := orderDetailPreloads(tx).
		First(&order, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &order, nil
}

// OrderListFilter is the optional filter set for ListPaged.
// Empty fields are ignored. CreatedFrom/CreatedTo are half-open [from, to).
type OrderListFilter struct {
	Limit       int
	Offset      int
	Since       *time.Time
	CreatedFrom *time.Time
	CreatedTo   *time.Time
	Status      string
	Query       string
}

func (r *OrderRepository) applyListFilter(q *gorm.DB, f OrderListFilter) *gorm.DB {
	if f.Since != nil {
		q = q.Where("updated_at >= ? OR created_at >= ?", *f.Since, *f.Since)
	}
	if f.CreatedFrom != nil {
		q = q.Where("created_at >= ?", *f.CreatedFrom)
	}
	if f.CreatedTo != nil {
		q = q.Where("created_at < ?", *f.CreatedTo)
	}
	if status := strings.ToUpper(strings.TrimSpace(f.Status)); status != "" && status != "ALL" {
		q = q.Where("order_status = ?", status)
	}
	if raw := strings.TrimSpace(f.Query); raw != "" {
		like := "%" + raw + "%"
		digits := strings.Map(func(r rune) rune {
			if r >= '0' && r <= '9' {
				return r
			}
			return -1
		}, raw)
		if digits != "" {
			q = q.Where(
				"order_number ILIKE ? OR customer_name ILIKE ? OR phone ILIKE ? OR REPLACE(phone, '-', '') LIKE ?",
				like, like, like, "%"+digits+"%",
			)
		} else {
			q = q.Where(
				"order_number ILIKE ? OR customer_name ILIKE ?",
				like, like,
			)
		}
	}
	return q
}

// ListPaged returns orders newest-first with heavy relation preloads, but
// always bounded by limit/offset to prevent high memory usage.
// When Since is non-nil, only rows with updated_at or created_at >= since
// are returned (additive filter for POS incremental polls).
// Total is the count matching filters (ignores limit/offset).
func (r *OrderRepository) ListPaged(f OrderListFilter) ([]domain.Order, int64, error) {
	limit, offset := f.Limit, f.Offset
	if limit <= 0 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	countQ := r.applyListFilter(r.db.Model(&domain.Order{}), f)
	var total int64
	if err := countQ.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var orders []domain.Order
	q := r.applyListFilter(orderListPreloads(r.db), f)
	if err := q.
		Order("created_at desc").
		Limit(limit).
		Offset(offset).
		Find(&orders).Error; err != nil {
		return nil, 0, err
	}
	return orders, total, nil
}

func (r *OrderRepository) List() ([]domain.Order, error) {
	rows, _, err := r.ListPaged(OrderListFilter{Limit: 50, Offset: 0})
	return rows, err
}

// ListByCustomerID returns the customer's newest orders (capped), with items for reorder.
func (r *OrderRepository) ListByCustomerID(customerID uuid.UUID, limit int) ([]domain.Order, error) {
	if limit <= 0 {
		limit = 5
	}
	if limit > 5 {
		limit = 5
	}
	var orders []domain.Order
	if err := orderListPreloads(r.db).
		Where("customer_id = ?", customerID).
		Order("created_at desc").
		Limit(limit).
		Find(&orders).Error; err != nil {
		return nil, err
	}
	return orders, nil
}

func (r *OrderRepository) ListByStatus(status string) ([]domain.Order, error) {
	limit := 200
	if status == "PENDING" {
		limit = 300
	}
	var orders []domain.Order
	if err := orderListPreloads(r.db).
		Where("order_status = ?", status).
		Order("created_at desc").
		Limit(limit).
		Find(&orders).Error; err != nil {
		return nil, err
	}
	return orders, nil
}

func (r *OrderRepository) ListByType(orderType string) ([]domain.Order, error) {
	var orders []domain.Order
	if err := orderListPreloads(r.db).
		Where("order_type = ?", orderType).
		Order("created_at desc").
		Limit(200).
		Find(&orders).Error; err != nil {
		return nil, err
	}
	return orders, nil
}

func (r *OrderRepository) UpdateStatus(tx *gorm.DB, id uuid.UUID, status string) error {
	return tx.Model(&domain.Order{}).Where("id = ?", id).Update("order_status", status).Error
}

// TransitionStatus updates status only when current status is fromStatus (atomic).
func (r *OrderRepository) TransitionStatus(tx *gorm.DB, id uuid.UUID, fromStatus, toStatus string) (int64, error) {
	res := tx.Model(&domain.Order{}).
		Where("id = ? AND order_status = ?", id, fromStatus).
		Update("order_status", toStatus)
	return res.RowsAffected, res.Error
}

func (r *OrderRepository) Update(tx *gorm.DB, id uuid.UUID, updates map[string]any) error {
	return tx.Model(&domain.Order{}).Where("id = ?", id).Updates(updates).Error
}

func (r *OrderRepository) ReplaceItems(tx *gorm.DB, orderID uuid.UUID, items []domain.OrderItem) error {
	if err := tx.Where("order_id = ?", orderID).Delete(&domain.OrderItem{}).Error; err != nil {
		return err
	}
	if len(items) == 0 {
		return nil
	}
	for i := range items {
		items[i].OrderID = orderID
	}
	return tx.Create(&items).Error
}

func (r *OrderRepository) Delete(tx *gorm.DB, id uuid.UUID) error {
	return tx.Delete(&domain.Order{}, "id = ?", id).Error
}

// CustomerLookupRow is a lightweight order projection for phone autocomplete.
type CustomerLookupRow struct {
	Phone        string     `json:"phone"`
	CustomerName string     `json:"customer_name"`
	Address      string     `json:"address"`
	LocationID   *uuid.UUID `json:"location_id"`
	CreatedAt    time.Time  `json:"created_at"`
}

// ListForCustomerLookup returns recent non-walk-in orders whose phone may match q.
// Matching is loose in SQL (LIKE); callers should normalize digits in Go.
func (r *OrderRepository) ListForCustomerLookup(q string, limit int) ([]CustomerLookupRow, error) {
	if limit <= 0 {
		limit = 200
	}
	if limit > 400 {
		limit = 400
	}
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, q)
	if len(digits) < 4 {
		return nil, nil
	}

	var rows []CustomerLookupRow
	// Match stored phones with or without dashes: 03001234567 / 0300-1234567
	patternDigits := digits + "%"
	patternDashed := digits
	if len(digits) > 4 {
		patternDashed = digits[:4] + "-" + digits[4:] + "%"
	} else {
		patternDashed = digits + "%"
	}

	err := r.db.Model(&domain.Order{}).
		Select("phone, customer_name, address, location_id, created_at").
		Where("phone <> ? AND phone <> ?", "0000000000", "0000-0000000").
		Where(
			"phone LIKE ? OR REPLACE(REPLACE(phone, '-', ''), ' ', '') LIKE ?",
			patternDashed,
			patternDigits,
		).
		Order("created_at desc").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	return rows, nil
}
