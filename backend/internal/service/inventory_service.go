package service

import (
	"net/http"
	"strings"
	"time"

	"backend/internal/domain"
	"backend/internal/repository"
	"backend/internal/utils"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type InventoryService struct {
	db   *gorm.DB
	repo *repository.InventoryRepository
}

func NewInventoryService(db *gorm.DB) *InventoryService {
	return &InventoryService{db: db, repo: repository.NewInventoryRepository(db)}
}

// InventoryInput is the payload used to create or update an ingredient.
type InventoryInput struct {
	Name             string     `json:"name"`
	Category         string     `json:"category"`
	UnitKind         string     `json:"unit_kind"`
	Unit             string     `json:"unit"`
	PurchaseUnit     string     `json:"purchase_unit"`
	UnitsPerPurchase int64      `json:"units_per_purchase"`
	Stock            *int64     `json:"stock"`
	MinimumStock     int64      `json:"minimum_stock"`
	PurchasePrice    int        `json:"purchase_price"`
	SupplierID       *uuid.UUID `json:"supplier_id"`
	Supplier         string     `json:"supplier"`
	IsActive         *bool      `json:"is_active"`
}

// normalize fills in the derived unit fields so the caller only has to supply
// what it actually knows. The owner picks "KG" and the rest is inferred.
func (in *InventoryInput) normalize() {
	in.UnitKind = domain.NormalizeUnitKind(in.UnitKind)
	base := domain.BaseUnitForKind(in.UnitKind)
	if strings.TrimSpace(in.Unit) == "" {
		in.Unit = base
	}
	if strings.TrimSpace(in.PurchaseUnit) == "" {
		in.PurchaseUnit = in.Unit
	}
	if in.UnitsPerPurchase <= 0 {
		in.UnitsPerPurchase = domain.DefaultUnitsPerPurchase(in.PurchaseUnit)
	}
}

func (s *InventoryService) List() ([]domain.Inventory, error) {
	return s.repo.List()
}

// ListUpdatedSince is additive for POS incremental polls; List() stays full.
func (s *InventoryService) ListUpdatedSince(since time.Time) ([]domain.Inventory, error) {
	return s.repo.ListUpdatedSince(since)
}

func (s *InventoryService) ListPaged(limit, offset int) ([]domain.Inventory, int64, error) {
	return s.repo.ListPaged(limit, offset)
}

func (s *InventoryService) GetByID(id uuid.UUID) (*domain.Inventory, error) {
	return s.repo.GetByID(id)
}

// Create adds an ingredient. Any opening stock is written through the ledger so
// the item's history starts with an explicit OPENING movement rather than a
// value that appeared from nowhere.
func (s *InventoryService) Create(in InventoryInput) (*domain.Inventory, error) {
	if strings.TrimSpace(in.Name) == "" {
		return nil, utils.NewAppError(http.StatusBadRequest, "item name is required")
	}
	in.normalize()

	item := &domain.Inventory{
		Name:             strings.TrimSpace(in.Name),
		Category:         strings.TrimSpace(in.Category),
		UnitKind:         in.UnitKind,
		Unit:             in.Unit,
		PurchaseUnit:     in.PurchaseUnit,
		UnitsPerPurchase: in.UnitsPerPurchase,
		MinimumStock:     in.MinimumStock,
		PurchasePrice:    in.PurchasePrice,
		SupplierID:       in.SupplierID,
		Supplier:         strings.TrimSpace(in.Supplier),
		IsActive:         true,
	}
	if in.IsActive != nil {
		item.IsActive = *in.IsActive
	}
	// Seed the average cost from the stated purchase price so stock has a value
	// even before the first recorded delivery.
	if in.PurchasePrice > 0 && in.UnitsPerPurchase > 0 {
		item.AvgCostMicros = (int64(in.PurchasePrice) * domain.CostScale) / in.UnitsPerPurchase
	}

	opening := int64(0)
	if in.Stock != nil {
		opening = *in.Stock
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		if opening != 0 {
			_, err := s.repo.ApplyMovement(tx, repository.Movement{
				InventoryID:    item.ID,
				QuantityBase:   opening,
				Type:           domain.StockOpening,
				Reason:         "Opening stock",
				UnitCostMicros: item.AvgCostMicros,
				ReferenceType:  domain.RefManual,
			})
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	item.Stock = opening
	return item, nil
}

// Update edits an ingredient's descriptive fields. A stock value supplied here
// is treated as a correction and routed through the ledger as an ADJUSTMENT so
// the change is always explainable. Empty string fields are left alone so
// partial POS offline updates do not wipe category / unit metadata.
func (s *InventoryService) Update(id uuid.UUID, in InventoryInput) error {
	existing, err := s.repo.GetByID(id)
	if err != nil {
		return err
	}

	updates := map[string]any{}
	if strings.TrimSpace(in.Name) != "" {
		updates["name"] = strings.TrimSpace(in.Name)
	}
	if strings.TrimSpace(in.Category) != "" {
		updates["category"] = strings.TrimSpace(in.Category)
	}
	if strings.TrimSpace(in.UnitKind) != "" {
		updates["unit_kind"] = domain.NormalizeUnitKind(in.UnitKind)
		if strings.TrimSpace(in.Unit) == "" {
			updates["unit"] = domain.BaseUnitForKind(in.UnitKind)
		}
	}
	if strings.TrimSpace(in.Unit) != "" {
		updates["unit"] = strings.TrimSpace(in.Unit)
	}
	if strings.TrimSpace(in.PurchaseUnit) != "" {
		updates["purchase_unit"] = strings.TrimSpace(in.PurchaseUnit)
		if in.UnitsPerPurchase <= 0 {
			updates["units_per_purchase"] = domain.DefaultUnitsPerPurchase(in.PurchaseUnit)
		}
	}
	if in.UnitsPerPurchase > 0 {
		updates["units_per_purchase"] = in.UnitsPerPurchase
	}
	if in.MinimumStock > 0 || (in.MinimumStock == 0 && in.Name != "") {
		// Allow explicitly setting minimum to 0 when this is a full form save
		// (name present). Pure stock-only patches leave minimum alone.
		if strings.TrimSpace(in.Name) != "" || in.MinimumStock > 0 {
			updates["minimum_stock"] = in.MinimumStock
		}
	}
	if in.PurchasePrice > 0 || strings.TrimSpace(in.Name) != "" {
		updates["purchase_price"] = in.PurchasePrice
	}
	if strings.TrimSpace(in.Supplier) != "" || strings.TrimSpace(in.Name) != "" {
		updates["supplier"] = strings.TrimSpace(in.Supplier)
	}
	if in.SupplierID != nil {
		updates["supplier_id"] = *in.SupplierID
	}
	if in.IsActive != nil {
		updates["is_active"] = *in.IsActive
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		if len(updates) > 0 {
			if err := tx.Model(&domain.Inventory{}).Where("id = ?", id).Updates(updates).Error; err != nil {
				return err
			}
		}
		if in.Stock != nil && *in.Stock != existing.Stock {
			delta := *in.Stock - existing.Stock
			_, err := s.repo.ApplyMovement(tx, repository.Movement{
				InventoryID:   id,
				QuantityBase:  delta,
				Type:          domain.StockAdjustment,
				Reason:        "Manual stock correction",
				ReferenceType: domain.RefManual,
			})
			return err
		}
		return nil
	})
}

// Delete removes an ingredient, refusing when it is still referenced so history
// and recipes stay intact.
func (s *InventoryService) Delete(id uuid.UUID) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var recipeRefs int64
		if err := tx.Model(&domain.Recipe{}).Where("inventory_id = ?", id).Count(&recipeRefs).Error; err != nil {
			return err
		}
		if recipeRefs > 0 {
			return utils.NewAppError(http.StatusConflict,
				"cannot delete an ingredient used by a recipe; remove it from recipes first")
		}
		var purchaseRefs int64
		if err := tx.Model(&domain.PurchaseItem{}).Where("inventory_id = ?", id).Count(&purchaseRefs).Error; err != nil {
			return err
		}
		if purchaseRefs > 0 {
			return utils.NewAppError(http.StatusConflict,
				"cannot delete an ingredient that appears on a purchase; mark it inactive instead")
		}
		if err := tx.Where("inventory_id = ?", id).Delete(&domain.InventoryTransaction{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ?", id).Delete(&domain.Inventory{}).Error
	})
}

// StockChangeInput records a manual stock movement (wastage or correction).
type StockChangeInput struct {
	InventoryID uuid.UUID `json:"inventory_id"`
	// Quantity is always positive; the movement type decides the direction.
	Quantity int64  `json:"quantity"`
	Reason   string `json:"reason"`
}

// RecordWastage removes spoiled or damaged stock and books the money lost.
func (s *InventoryService) RecordWastage(in StockChangeInput) error {
	if in.Quantity <= 0 {
		return utils.NewAppError(http.StatusBadRequest, "wastage quantity must be greater than zero")
	}
	reason := strings.TrimSpace(in.Reason)
	if reason == "" {
		reason = "Wastage"
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		_, err := s.repo.ApplyMovement(tx, repository.Movement{
			InventoryID:   in.InventoryID,
			QuantityBase:  -in.Quantity,
			Type:          domain.StockWastage,
			Reason:        reason,
			ReferenceType: domain.RefManual,
		})
		return err
	})
}

// ProductWastageInput wastes finished menu items (e.g. one whole pizza / staff meal)
// and deducts every ingredient from the product recipe automatically.
type ProductWastageInput struct {
	ProductID     uuid.UUID  `json:"product_id"`
	ProductSizeID *uuid.UUID `json:"product_size_id"`
	// Quantity is how many finished products were wasted (usually 1).
	Quantity int    `json:"quantity"`
	Reason   string `json:"reason"`
}

// ProductWastageLine is one ingredient deducted for the staff UI summary.
type ProductWastageLine struct {
	InventoryID   uuid.UUID `json:"inventory_id"`
	InventoryName string    `json:"inventory_name"`
	Unit          string    `json:"unit"`
	QuantityBase  int64     `json:"quantity_base"`
}

// ProductWastageResult summarizes what was deducted.
type ProductWastageResult struct {
	ProductName string               `json:"product_name"`
	Quantity    int                  `json:"quantity"`
	Lines       []ProductWastageLine `json:"lines"`
}

// RecordProductWastage looks up the BOM for a product (+ optional size) and
// writes WASTAGE movements for each ingredient × finished quantity.
func (s *InventoryService) RecordProductWastage(in ProductWastageInput) (*ProductWastageResult, error) {
	if in.ProductID == uuid.Nil {
		return nil, utils.NewAppError(http.StatusBadRequest, "select a product")
	}
	if in.Quantity <= 0 {
		return nil, utils.NewAppError(http.StatusBadRequest, "quantity must be at least 1")
	}
	reason := strings.TrimSpace(in.Reason)
	if reason == "" {
		reason = "Product wastage / staff meal"
	}

	var product domain.Product
	if err := s.db.First(&product, "id = ?", in.ProductID).Error; err != nil {
		return nil, utils.NewAppError(http.StatusBadRequest, "product not found")
	}

	sizeID := uuid.Nil
	if in.ProductSizeID != nil {
		sizeID = *in.ProductSizeID
	}

	var result *ProductWastageResult
	err := s.db.Transaction(func(tx *gorm.DB) error {
		recipes, err := s.repo.RecipeLinesFor(tx, in.ProductID, sizeID)
		if err != nil {
			return err
		}
		if len(recipes) == 0 {
			return utils.NewAppError(http.StatusBadRequest,
				"no recipe for this product — set ingredients under Recipes first")
		}

		// Aggregate duplicate inventory lines (same ingredient listed twice).
		need := map[uuid.UUID]int64{}
		for _, r := range recipes {
			if r.QuantityRequired <= 0 {
				continue
			}
			need[r.InventoryID] += r.QuantityRequired * int64(in.Quantity)
		}
		if len(need) == 0 {
			return utils.NewAppError(http.StatusBadRequest, "recipe has no usable quantities")
		}

		lines := make([]ProductWastageLine, 0, len(need))
		detail := reason + " — " + product.Name
		for invID, qty := range need {
			var inv domain.Inventory
			if err := tx.First(&inv, "id = ?", invID).Error; err != nil {
				return utils.NewAppError(http.StatusBadRequest, "recipe ingredient missing from inventory")
			}
			if _, err := s.repo.ApplyMovement(tx, repository.Movement{
				InventoryID:   invID,
				QuantityBase:  -qty,
				Type:          domain.StockWastage,
				Reason:        detail,
				ReferenceType: domain.RefManual,
			}); err != nil {
				return err
			}
			lines = append(lines, ProductWastageLine{
				InventoryID:   invID,
				InventoryName: inv.Name,
				Unit:          inv.Unit,
				QuantityBase:  qty,
			})
		}

		result = &ProductWastageResult{
			ProductName: product.Name,
			Quantity:    in.Quantity,
			Lines:       lines,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// AdjustStock applies a signed correction, used for stock-takes.
func (s *InventoryService) AdjustStock(in StockChangeInput) error {
	if in.Quantity == 0 {
		return utils.NewAppError(http.StatusBadRequest, "adjustment quantity cannot be zero")
	}
	reason := strings.TrimSpace(in.Reason)
	if reason == "" {
		reason = "Stock adjustment"
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		_, err := s.repo.ApplyMovement(tx, repository.Movement{
			InventoryID:   in.InventoryID,
			QuantityBase:  in.Quantity,
			Type:          domain.StockAdjustment,
			Reason:        reason,
			ReferenceType: domain.RefManual,
		})
		return err
	})
}

// BulkStockLine is one row from the simple Inventory "Save all" screen.
// BuyQty is in purchase units (e.g. 1.5 for 1.5 KG). BuyCost is total Rs paid
// for that buy. Neither is written to Expenses — stock value / COGS handles it.
type BulkStockLine struct {
	InventoryID      uuid.UUID `json:"inventory_id"`
	MinimumStock     *int64    `json:"minimum_stock"`
	PurchaseUnit     string    `json:"purchase_unit"`
	UnitsPerPurchase int64     `json:"units_per_purchase"`
	BuyQty           float64   `json:"buy_qty"`
	BuyCost          int       `json:"buy_cost"`
}

// BulkStockInput saves many inventory rows in one transaction.
type BulkStockInput struct {
	Items []BulkStockLine `json:"items"`
}

// BulkSave applies min-stock / unit tweaks and optional stock buys with
// weighted-average cost. Buys are NOT posted as expenses.
func (s *InventoryService) BulkSave(in BulkStockInput) error {
	if len(in.Items) == 0 {
		return utils.NewAppError(http.StatusBadRequest, "no inventory rows to save")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		for _, line := range in.Items {
			if line.InventoryID == uuid.Nil {
				return utils.NewAppError(http.StatusBadRequest, "inventory_id is required")
			}
			var item domain.Inventory
			if err := tx.First(&item, "id = ?", line.InventoryID).Error; err != nil {
				return utils.NewAppError(http.StatusBadRequest, "inventory item not found")
			}

			updates := map[string]any{}
			purchaseUnit := strings.TrimSpace(line.PurchaseUnit)
			if purchaseUnit != "" && purchaseUnit != item.PurchaseUnit {
				updates["purchase_unit"] = purchaseUnit
			}
			unitsPer := line.UnitsPerPurchase
			if unitsPer <= 0 {
				if purchaseUnit != "" {
					unitsPer = domain.DefaultUnitsPerPurchase(purchaseUnit)
				} else {
					unitsPer = item.UnitsPerPurchase
				}
			}
			if unitsPer <= 0 {
				unitsPer = 1
			}
			if unitsPer != item.UnitsPerPurchase {
				updates["units_per_purchase"] = unitsPer
			}
			if line.MinimumStock != nil {
				updates["minimum_stock"] = *line.MinimumStock
			}

			if line.BuyQty < 0 {
				return utils.NewAppError(http.StatusBadRequest,
					"today bought cannot be negative for "+item.Name)
			}
			if line.BuyCost < 0 {
				return utils.NewAppError(http.StatusBadRequest,
					"today cost cannot be negative for "+item.Name)
			}

			qtyBase := int64(0)
			if line.BuyQty > 0 {
				qtyBase = int64(line.BuyQty*float64(unitsPer) + 0.5)
				if qtyBase < 1 {
					return utils.NewAppError(http.StatusBadRequest,
						"today bought is too small for "+item.Name)
				}
				// Last paid price per purchase unit (for next quick entry).
				if line.BuyQty > 0 {
					updates["purchase_price"] = int(float64(line.BuyCost)/line.BuyQty + 0.5)
				}
			}

			if len(updates) > 0 {
				if err := tx.Model(&domain.Inventory{}).
					Where("id = ?", line.InventoryID).
					Updates(updates).Error; err != nil {
					return err
				}
			}

			if qtyBase > 0 {
				unitCost := domain.CostMicrosPerBaseUnit(line.BuyCost, qtyBase)
				if _, err := s.repo.ApplyMovement(tx, repository.Movement{
					InventoryID:    line.InventoryID,
					QuantityBase:   qtyBase,
					Type:           domain.StockPurchase,
					Reason:         "Stock buy (inventory page)",
					UnitCostMicros: unitCost,
					ReferenceType:  domain.RefManual,
				}); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func (s *InventoryService) ListTransactions(
	inventoryID *uuid.UUID,
	movementType string,
	limit int,
) ([]domain.InventoryTransaction, error) {
	return s.repo.ListTransactions(inventoryID, movementType, limit)
}

// AlertSet is the "what needs my attention" payload for the dashboard.
type AlertSet struct {
	OutOfStock     []domain.Inventory `json:"out_of_stock"`
	LowStock       []domain.Inventory `json:"low_stock"`
	NegativeStock  []domain.Inventory `json:"negative_stock"`
	NeverPurchased []domain.Inventory `json:"never_purchased"`
	NeverUsed      []domain.Inventory `json:"never_used"`
	StockValue     int                `json:"stock_value"`
}

// Alerts groups every stock condition the owner should act on.
func (s *InventoryService) Alerts() (*AlertSet, error) {
	items, err := s.repo.List()
	if err != nil {
		return nil, err
	}

	out := &AlertSet{
		OutOfStock:    []domain.Inventory{},
		LowStock:      []domain.Inventory{},
		NegativeStock: []domain.Inventory{},
	}
	for _, item := range items {
		if !item.IsActive {
			continue
		}
		switch {
		case item.Stock < 0:
			out.NegativeStock = append(out.NegativeStock, item)
		case item.Stock == 0:
			out.OutOfStock = append(out.OutOfStock, item)
		case item.IsLow():
			out.LowStock = append(out.LowStock, item)
		}
	}

	if out.NeverPurchased, err = s.repo.NeverPurchased(); err != nil {
		return nil, err
	}
	if out.NeverUsed, err = s.repo.NeverUsed(); err != nil {
		return nil, err
	}
	if out.StockValue, err = s.repo.StockValue(); err != nil {
		return nil, err
	}
	return out, nil
}

// Recommendation is a suggested purchase for one ingredient.
type Recommendation struct {
	InventoryID  uuid.UUID `json:"inventory_id"`
	Name         string    `json:"name"`
	Category     string    `json:"category"`
	Unit         string    `json:"unit"`
	PurchaseUnit string    `json:"purchase_unit"`
	CurrentStock int64     `json:"current_stock"`
	MinimumStock int64     `json:"minimum_stock"`
	// AvgDailyUsage is in base units per day.
	AvgDailyUsage int64 `json:"avg_daily_usage"`
	// DaysRemaining is how long current stock lasts at that rate; -1 means the
	// item has no recorded usage so it cannot be projected.
	DaysRemaining float64 `json:"days_remaining"`
	// SuggestedQtyBase / SuggestedQtyPurchase are what to buy.
	SuggestedQtyBase     int64  `json:"suggested_qty_base"`
	SuggestedQtyPurchase int64  `json:"suggested_qty_purchase"`
	EstimatedCost        int    `json:"estimated_cost"`
	Urgency              string `json:"urgency"`
	Reason               string `json:"reason"`
}

// RecommendPurchases works out what the owner should buy next.
//
// It does not simply compare stock against the reorder level: it measures how
// fast each ingredient is actually being consumed and orders enough to cover a
// target number of days, which is what stops a kitchen running out mid-service.
func (s *InventoryService) RecommendPurchases(lookbackDays, coverDays int) ([]Recommendation, error) {
	if lookbackDays <= 0 {
		lookbackDays = 14
	}
	if coverDays <= 0 {
		coverDays = 7
	}

	items, err := s.repo.List()
	if err != nil {
		return nil, err
	}
	usage, err := s.repo.UsageSince(time.Now().AddDate(0, 0, -lookbackDays))
	if err != nil {
		return nil, err
	}
	usedByItem := make(map[uuid.UUID]int64, len(usage))
	for _, u := range usage {
		usedByItem[u.InventoryID] = u.UsedBase
	}

	recs := []Recommendation{}
	for _, item := range items {
		if !item.IsActive {
			continue
		}
		daily := usedByItem[item.ID] / int64(lookbackDays)
		target := item.MinimumStock
		if daily > 0 {
			// Cover the forecast window plus keep the safety buffer intact.
			target = daily*int64(coverDays) + item.MinimumStock
		}

		if item.Stock > target {
			continue
		}

		shortfall := target - item.Stock
		if shortfall <= 0 {
			continue
		}

		perPurchase := item.UnitsPerPurchase
		if perPurchase <= 0 {
			perPurchase = 1
		}
		// Round up to whole purchase units — you cannot buy 0.3 of a carton.
		purchaseQty := (shortfall + perPurchase - 1) / perPurchase
		if purchaseQty < 1 {
			purchaseQty = 1
		}

		days := -1.0
		if daily > 0 {
			days = float64(item.Stock) / float64(daily)
		}

		rec := Recommendation{
			InventoryID:          item.ID,
			Name:                 item.Name,
			Category:             item.Category,
			Unit:                 item.Unit,
			PurchaseUnit:         item.PurchaseUnit,
			CurrentStock:         item.Stock,
			MinimumStock:         item.MinimumStock,
			AvgDailyUsage:        daily,
			DaysRemaining:        days,
			SuggestedQtyBase:     purchaseQty * perPurchase,
			SuggestedQtyPurchase: purchaseQty,
			EstimatedCost:        domain.ValueFromMicros(item.AvgCostMicros, purchaseQty*perPurchase),
		}

		switch {
		case item.Stock < 0:
			rec.Urgency = "CRITICAL"
			rec.Reason = "Stock is negative — sales were completed without recorded deliveries"
		case item.Stock == 0:
			rec.Urgency = "CRITICAL"
			rec.Reason = "Out of stock"
		case days >= 0 && days <= 2:
			rec.Urgency = "HIGH"
			rec.Reason = "Stock will run out within two days at the current usage rate"
		case days >= 0 && days <= float64(coverDays):
			rec.Urgency = "MEDIUM"
			rec.Reason = "Stock will not cover the next " + itoa(coverDays) + " days"
		default:
			rec.Urgency = "LOW"
			rec.Reason = "At or below the reorder level"
		}

		recs = append(recs, rec)
	}
	return recs, nil
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
