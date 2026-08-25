package repository

import (
	"time"

	"backend/internal/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type InventoryRepository struct {
	db *gorm.DB
}

func NewInventoryRepository(db *gorm.DB) *InventoryRepository {
	return &InventoryRepository{db: db}
}

// Movement describes a single change to an item's stock.
type Movement struct {
	InventoryID uuid.UUID
	// QuantityBase is signed: positive adds stock, negative removes it.
	QuantityBase int64
	Type         string
	Reason       string
	// UnitCostMicros is only meaningful for inbound movements (purchases). For
	// outbound movements the item's current average cost is applied instead.
	UnitCostMicros int64
	ReferenceType  string
	ReferenceID    *uuid.UUID
}

// ApplyMovement is the single choke point for every stock change in the system.
//
// It locks the inventory row, applies the quantity, maintains the weighted
// average cost for inbound movements, and appends a ledger row carrying the
// cost and the resulting balance. Everything that touches stock (purchases,
// order consumption, wastage, corrections) goes through here so the ledger can
// never drift from the on-hand number.
//
// Stock is deliberately allowed to go negative: refusing a movement would mean
// refusing to complete a customer's order at the counter. Negative balances are
// reported as alerts instead.
func (r *InventoryRepository) ApplyMovement(tx *gorm.DB, m Movement) (*domain.InventoryTransaction, error) {
	if m.QuantityBase == 0 {
		return nil, nil
	}

	var item domain.Inventory
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&item, "id = ?", m.InventoryID).Error; err != nil {
		return nil, err
	}

	unitCost := m.UnitCostMicros
	newStock := item.Stock + m.QuantityBase

	updates := map[string]any{"stock": newStock}

	if m.QuantityBase > 0 {
		// Inbound: blend the incoming cost into the weighted average. Only the
		// positive portion of existing stock carries value, so a negative
		// balance resets the average to the new purchase cost.
		if unitCost > 0 {
			if item.Stock > 0 {
				totalValue := item.AvgCostMicros*item.Stock + unitCost*m.QuantityBase
				if newStock > 0 {
					updates["avg_cost_micros"] = totalValue / newStock
				} else {
					updates["avg_cost_micros"] = unitCost
				}
			} else {
				updates["avg_cost_micros"] = unitCost
			}
		}
	} else if unitCost == 0 {
		// Outbound movements are valued at the item's current average cost.
		unitCost = item.AvgCostMicros
	}

	if err := tx.Model(&domain.Inventory{}).
		Where("id = ?", m.InventoryID).
		Updates(updates).Error; err != nil {
		return nil, err
	}

	entry := &domain.InventoryTransaction{
		InventoryID:     m.InventoryID,
		Quantity:        m.QuantityBase,
		TransactionType: m.Type,
		Reason:          m.Reason,
		UnitCostMicros:  unitCost,
		TotalCost:       domain.ValueFromMicros(unitCost, absInt64(m.QuantityBase)),
		BalanceAfter:    newStock,
		ReferenceType:   m.ReferenceType,
		ReferenceID:     m.ReferenceID,
	}
	if err := tx.Create(entry).Error; err != nil {
		return nil, err
	}
	return entry, nil
}

func absInt64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}

// RecipeLinesFor resolves the bill of materials for a product at a given size.
//
// Size-specific lines win; when none exist the product's size-agnostic lines
// are used. This keeps older size-less recipes working while allowing a Large
// pizza to consume more than a Small one.
func (r *InventoryRepository) RecipeLinesFor(
	tx *gorm.DB,
	productID uuid.UUID,
	productSizeID uuid.UUID,
) ([]domain.Recipe, error) {
	var sized []domain.Recipe
	if err := tx.Where("product_id = ? AND product_size_id = ?", productID, productSizeID).
		Find(&sized).Error; err != nil {
		return nil, err
	}
	if len(sized) > 0 {
		return sized, nil
	}

	var generic []domain.Recipe
	if err := tx.Where("product_id = ? AND product_size_id IS NULL", productID).
		Find(&generic).Error; err != nil {
		return nil, err
	}
	return generic, nil
}

// RecipeLinesForProducts loads all recipe rows for many products in one query.
func (r *InventoryRepository) RecipeLinesForProducts(
	tx *gorm.DB,
	productIDs []uuid.UUID,
) (map[uuid.UUID][]domain.Recipe, error) {
	out := make(map[uuid.UUID][]domain.Recipe, len(productIDs))
	if len(productIDs) == 0 {
		return out, nil
	}
	var rows []domain.Recipe
	if err := tx.Where("product_id IN ?", productIDs).Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.ProductID] = append(out[row.ProductID], row)
	}
	return out, nil
}

// GetRecipeByProductID returns every BOM line for a product regardless of size.
func (r *InventoryRepository) GetRecipeByProductID(tx *gorm.DB, productID uuid.UUID) ([]domain.Recipe, error) {
	var recipes []domain.Recipe
	if err := tx.Where("product_id = ?", productID).Find(&recipes).Error; err != nil {
		return nil, err
	}
	return recipes, nil
}

func (r *InventoryRepository) LockInventory(tx *gorm.DB, inventoryID uuid.UUID) (*domain.Inventory, error) {
	var item domain.Inventory
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&item, "id = ?", inventoryID).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *InventoryRepository) AddTransaction(tx *gorm.DB, t *domain.InventoryTransaction) error {
	return tx.Create(t).Error
}

func (r *InventoryRepository) GetByID(id uuid.UUID) (*domain.Inventory, error) {
	var item domain.Inventory
	if err := r.db.First(&item, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *InventoryRepository) List() ([]domain.Inventory, error) {
	var items []domain.Inventory
	if err := r.db.Order("name asc").Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

// ListUpdatedSince returns inventory rows changed at or after since.
// Additive filter for POS incremental polls — List() unchanged for old clients.
func (r *InventoryRepository) ListUpdatedSince(since time.Time) ([]domain.Inventory, error) {
	var items []domain.Inventory
	if err := r.db.
		Where("updated_at >= ? OR created_at >= ?", since, since).
		Order("name asc").
		Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

func (r *InventoryRepository) ListPaged(limit, offset int) ([]domain.Inventory, int64, error) {
	var total int64
	var items []domain.Inventory
	if err := r.db.Model(&domain.Inventory{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	q := r.db.Order("name asc")
	if offset > 0 {
		q = q.Offset(offset)
	}
	if limit > 0 {
		q = q.Limit(limit)
	}
	if err := q.Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (r *InventoryRepository) LowStock() ([]domain.Inventory, error) {
	var inv []domain.Inventory
	if err := r.db.
		Where("stock <= minimum_stock AND is_active = ?", true).
		Order("stock asc").
		Find(&inv).Error; err != nil {
		return nil, err
	}
	return inv, nil
}

// ListTransactions returns ledger rows, newest first, optionally filtered.
func (r *InventoryRepository) ListTransactions(
	inventoryID *uuid.UUID,
	movementType string,
	limit int,
) ([]domain.InventoryTransaction, error) {
	var rows []domain.InventoryTransaction
	q := r.db.Preload("Inventory").Order("created_at desc")
	if inventoryID != nil {
		q = q.Where("inventory_id = ?", *inventoryID)
	}
	if movementType != "" {
		q = q.Where("transaction_type = ?", movementType)
	}
	if limit > 0 {
		q = q.Limit(limit)
	}
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// UsageRow is the aggregated consumption of one ingredient over a window.
type UsageRow struct {
	InventoryID uuid.UUID `json:"inventory_id"`
	UsedBase    int64     `json:"used_base"`
}

// UsageSince totals outbound movements (consumption + wastage) per ingredient
// since a point in time. This drives average daily usage and reorder advice.
func (r *InventoryRepository) UsageSince(since time.Time) ([]UsageRow, error) {
	var rows []UsageRow
	err := r.db.Model(&domain.InventoryTransaction{}).
		Select("inventory_id, COALESCE(SUM(-quantity), 0) as used_base").
		Where("transaction_type IN ? AND quantity < 0 AND created_at >= ?",
			[]string{domain.StockConsumption, domain.StockWastage}, since).
		Group("inventory_id").
		Scan(&rows).Error
	return rows, err
}

// ConsumptionCostBetween totals the money value of ingredients consumed in a
// window. This is the cost of goods sold used by profit reporting.
func (r *InventoryRepository) ConsumptionCostBetween(start, end time.Time) (int, error) {
	var total int
	err := r.db.Model(&domain.InventoryTransaction{}).
		Select("COALESCE(SUM(total_cost), 0)").
		Where("transaction_type = ? AND created_at >= ? AND created_at < ?",
			domain.StockConsumption, start, end).
		Scan(&total).Error
	return total, err
}

// WastageCostBetween totals the money lost to wastage in a window.
func (r *InventoryRepository) WastageCostBetween(start, end time.Time) (int, error) {
	var total int
	err := r.db.Model(&domain.InventoryTransaction{}).
		Select("COALESCE(SUM(total_cost), 0)").
		Where("transaction_type = ? AND created_at >= ? AND created_at < ?",
			domain.StockWastage, start, end).
		Scan(&total).Error
	return total, err
}

// PurchaseCostBetween totals money spent on stock in a window.
// Uses the inventory ledger (PURCHASE movements) so Inventory-page bulk buys
// and posted purchase invoices are both counted — the Purchases UI is gone,
// but older purchase rows still wrote PURCHASE movements when posted.
func (r *InventoryRepository) PurchaseCostBetween(start, end time.Time) (int, error) {
	var total int
	err := r.db.Model(&domain.InventoryTransaction{}).
		Select("COALESCE(SUM(total_cost), 0)").
		Where("transaction_type = ? AND created_at >= ? AND created_at < ?",
			domain.StockPurchase, start, end).
		Scan(&total).Error
	return total, err
}

// StockValue is the total worth of everything on the shelf right now.
func (r *InventoryRepository) StockValue() (int, error) {
	var total int64
	err := r.db.Model(&domain.Inventory{}).
		Select("COALESCE(SUM(GREATEST(stock, 0) * avg_cost_micros / 1000000), 0)").
		Scan(&total).Error
	return int(total), err
}

// NeverPurchased lists items that have never had an inbound movement, which
// usually means the owner set them up but never recorded a delivery.
func (r *InventoryRepository) NeverPurchased() ([]domain.Inventory, error) {
	var items []domain.Inventory
	err := r.db.
		Where(`is_active = ? AND id NOT IN (
			SELECT inventory_id FROM inventory_transactions
			WHERE transaction_type IN (?, ?)
		)`, true, domain.StockPurchase, domain.StockOpening).
		Order("name asc").
		Find(&items).Error
	return items, err
}

// NeverUsed lists items that have never been consumed — candidates for
// de-listing, or a sign that a recipe is missing.
func (r *InventoryRepository) NeverUsed() ([]domain.Inventory, error) {
	var items []domain.Inventory
	err := r.db.
		Where(`is_active = ? AND id NOT IN (
			SELECT inventory_id FROM inventory_transactions
			WHERE transaction_type = ?
		)`, true, domain.StockConsumption).
		Order("name asc").
		Find(&items).Error
	return items, err
}

// NegativeStock lists items that have been oversold — stock went below zero
// because sales were completed without a recorded delivery.
func (r *InventoryRepository) NegativeStock() ([]domain.Inventory, error) {
	var items []domain.Inventory
	err := r.db.Where("stock < 0").Order("stock asc").Find(&items).Error
	return items, err
}
