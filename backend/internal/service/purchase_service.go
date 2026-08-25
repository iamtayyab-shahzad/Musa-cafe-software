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

type PurchaseService struct {
	db   *gorm.DB
	repo *repository.InventoryRepository
}

func NewPurchaseService(db *gorm.DB) *PurchaseService {
	return &PurchaseService{db: db, repo: repository.NewInventoryRepository(db)}
}

// PurchaseLineInput is one ingredient on a purchase document.
// QuantityMicros is the typed purchase quantity scaled by CostScale
// (e.g. 2.5 KG -> 2_500_000). QuantityBase may be supplied directly when the
// caller has already converted; otherwise it is derived.
type PurchaseLineInput struct {
	InventoryID    uuid.UUID `json:"inventory_id"`
	PurchaseUnit   string    `json:"purchase_unit"`
	QuantityMicros int64     `json:"quantity_micros"`
	QuantityBase   int64     `json:"quantity_base"`
	UnitPrice      int       `json:"unit_price"`
	LineTotal      int       `json:"line_total"`
}

// PurchaseInput is the payload for creating or replacing a purchase.
type PurchaseInput struct {
	InvoiceNumber string             `json:"invoice_number"`
	SupplierID    *uuid.UUID         `json:"supplier_id"`
	SupplierName  string             `json:"supplier_name"`
	PurchaseDate  time.Time          `json:"purchase_date"`
	Discount      int                `json:"discount"`
	OtherCost     int                `json:"other_cost"`
	PaymentMethod string             `json:"payment_method"`
	AmountPaid    int                `json:"amount_paid"`
	Notes         string             `json:"notes"`
	Items         []PurchaseLineInput `json:"items"`
}

func (s *PurchaseService) List() ([]domain.Purchase, error) {
	rows, _, err := s.ListPaged(0, 0)
	return rows, err
}

func (s *PurchaseService) ListPaged(limit, offset int) ([]domain.Purchase, int64, error) {
	var total int64
	var rows []domain.Purchase
	if err := s.db.Model(&domain.Purchase{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	q := s.db.Preload("Items").Preload("Items.Inventory").Preload("Supplier").
		Order("purchase_date desc, created_at desc")
	if offset > 0 {
		q = q.Offset(offset)
	}
	if limit > 0 {
		q = q.Limit(limit)
	}
	if err := q.Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func (s *PurchaseService) GetByID(id uuid.UUID) (*domain.Purchase, error) {
	var row domain.Purchase
	if err := s.db.Preload("Items").Preload("Items.Inventory").Preload("Supplier").
		First(&row, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

// Create posts a purchase: raises stock, updates average cost, writes ledger.
func (s *PurchaseService) Create(in PurchaseInput) (*domain.Purchase, error) {
	if len(in.Items) == 0 {
		return nil, utils.NewAppError(http.StatusBadRequest, "add at least one inventory item")
	}
	if in.PurchaseDate.IsZero() {
		in.PurchaseDate = time.Now()
	}
	if strings.TrimSpace(in.PaymentMethod) == "" {
		in.PaymentMethod = "cash"
	}

	purchase := &domain.Purchase{}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		built, err := s.buildPurchase(tx, in)
		if err != nil {
			return err
		}
		purchase = built
		if err := tx.Create(purchase).Error; err != nil {
			return err
		}
		return s.applyPurchaseMovements(tx, purchase, false)
	})
	if err != nil {
		return nil, err
	}
	return s.GetByID(purchase.ID)
}

// Update replaces a posted purchase. The previous stock effect is reversed
// first, then the new lines are applied — so editing never double-counts stock.
func (s *PurchaseService) Update(id uuid.UUID, in PurchaseInput) (*domain.Purchase, error) {
	if len(in.Items) == 0 {
		return nil, utils.NewAppError(http.StatusBadRequest, "add at least one inventory item")
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var existing domain.Purchase
		if err := tx.Preload("Items").First(&existing, "id = ?", id).Error; err != nil {
			return err
		}
		if existing.Status == domain.PurchaseStatusReversed {
			return utils.NewAppError(http.StatusConflict, "cannot edit a reversed purchase")
		}
		if err := s.applyPurchaseMovements(tx, &existing, true); err != nil {
			return err
		}
		if err := tx.Where("purchase_id = ?", id).Delete(&domain.PurchaseItem{}).Error; err != nil {
			return err
		}

		built, err := s.buildPurchase(tx, in)
		if err != nil {
			return err
		}
		if err := tx.Model(&domain.Purchase{}).Where("id = ?", id).Updates(map[string]any{
			"invoice_number": built.InvoiceNumber,
			"supplier_id":    built.SupplierID,
			"supplier_name":  built.SupplierName,
			"purchase_date":  built.PurchaseDate,
			"subtotal":       built.Subtotal,
			"discount":       built.Discount,
			"other_cost":     built.OtherCost,
			"grand_total":    built.GrandTotal,
			"payment_method": built.PaymentMethod,
			"amount_paid":    built.AmountPaid,
			"notes":          built.Notes,
			"status":         domain.PurchaseStatusPosted,
		}).Error; err != nil {
			return err
		}
		for i := range built.Items {
			built.Items[i].PurchaseID = id
			built.Items[i].ID = uuid.Nil
		}
		if err := tx.Create(&built.Items).Error; err != nil {
			return err
		}
		built.ID = id
		return s.applyPurchaseMovements(tx, built, false)
	})
	if err != nil {
		return nil, err
	}
	return s.GetByID(id)
}

// Reverse undoes a purchase: stock is reduced, ledger records a PURCHASE_REVERSAL,
// and the document is marked REVERSED. History is kept.
func (s *PurchaseService) Reverse(id uuid.UUID) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var purchase domain.Purchase
		if err := tx.Preload("Items").First(&purchase, "id = ?", id).Error; err != nil {
			return err
		}
		if purchase.Status == domain.PurchaseStatusReversed {
			return nil
		}
		if err := s.applyPurchaseMovements(tx, &purchase, true); err != nil {
			return err
		}
		return tx.Model(&domain.Purchase{}).Where("id = ?", id).
			Updates(map[string]any{"status": domain.PurchaseStatusReversed}).Error
	})
}

func (s *PurchaseService) buildPurchase(tx *gorm.DB, in PurchaseInput) (*domain.Purchase, error) {
	supplierName := strings.TrimSpace(in.SupplierName)
	if in.SupplierID != nil {
		var supplier domain.Supplier
		if err := tx.First(&supplier, "id = ?", *in.SupplierID).Error; err == nil {
			if supplierName == "" {
				supplierName = supplier.Name
			}
		}
	}

	items := make([]domain.PurchaseItem, 0, len(in.Items))
	subtotal := 0
	for _, line := range in.Items {
		if line.InventoryID == uuid.Nil {
			return nil, utils.NewAppError(http.StatusBadRequest, "every line needs an inventory item")
		}
		var inv domain.Inventory
		if err := tx.First(&inv, "id = ?", line.InventoryID).Error; err != nil {
			return nil, utils.NewAppError(http.StatusBadRequest, "inventory item not found")
		}

		purchaseUnit := strings.TrimSpace(line.PurchaseUnit)
		if purchaseUnit == "" {
			purchaseUnit = inv.PurchaseUnit
		}
		unitsPer := inv.UnitsPerPurchase
		if unitsPer <= 0 {
			unitsPer = domain.DefaultUnitsPerPurchase(purchaseUnit)
		}

		qtyBase := line.QuantityBase
		if qtyBase <= 0 && line.QuantityMicros > 0 {
			// quantity_micros / CostScale * units_per_purchase
			qtyBase = (line.QuantityMicros * unitsPer) / domain.CostScale
		}
		if qtyBase <= 0 {
			return nil, utils.NewAppError(http.StatusBadRequest,
				"quantity must be greater than zero for "+inv.Name)
		}

		lineTotal := line.LineTotal
		if lineTotal <= 0 && line.UnitPrice > 0 && line.QuantityMicros > 0 {
			lineTotal = int((int64(line.UnitPrice) * line.QuantityMicros) / domain.CostScale)
		}
		if lineTotal < 0 {
			lineTotal = 0
		}

		unitCost := domain.CostMicrosPerBaseUnit(lineTotal, qtyBase)
		items = append(items, domain.PurchaseItem{
			InventoryID:    line.InventoryID,
			PurchaseUnit:   purchaseUnit,
			QuantityMicros: line.QuantityMicros,
			QuantityBase:   qtyBase,
			UnitPrice:      line.UnitPrice,
			LineTotal:      lineTotal,
			UnitCostMicros: unitCost,
		})
		subtotal += lineTotal

		// Keep the item's "last paid" price in sync for quick data entry.
		_ = tx.Model(&domain.Inventory{}).Where("id = ?", inv.ID).Updates(map[string]any{
			"purchase_price": line.UnitPrice,
			"purchase_unit":  purchaseUnit,
			"supplier":       supplierName,
		}).Error
		if in.SupplierID != nil {
			_ = tx.Model(&domain.Inventory{}).Where("id = ?", inv.ID).
				Update("supplier_id", *in.SupplierID).Error
		}
	}

	grand := subtotal - in.Discount + in.OtherCost
	if grand < 0 {
		grand = 0
	}
	amountPaid := in.AmountPaid
	if amountPaid <= 0 {
		amountPaid = grand
	}

	return &domain.Purchase{
		InvoiceNumber: strings.TrimSpace(in.InvoiceNumber),
		SupplierID:    in.SupplierID,
		SupplierName:  supplierName,
		PurchaseDate:  in.PurchaseDate,
		Subtotal:      subtotal,
		Discount:      in.Discount,
		OtherCost:     in.OtherCost,
		GrandTotal:    grand,
		PaymentMethod: in.PaymentMethod,
		AmountPaid:    amountPaid,
		Status:        domain.PurchaseStatusPosted,
		Notes:         in.Notes,
		Items:         items,
	}, nil
}

func (s *PurchaseService) applyPurchaseMovements(tx *gorm.DB, purchase *domain.Purchase, reverse bool) error {
	refID := purchase.ID
	for _, item := range purchase.Items {
		qty := item.QuantityBase
		movementType := domain.StockPurchase
		reason := "Purchase " + purchase.InvoiceNumber
		if reverse {
			qty = -qty
			movementType = domain.StockPurchaseReversal
			reason = "Reversal of purchase " + purchase.InvoiceNumber
		}
		_, err := s.repo.ApplyMovement(tx, repository.Movement{
			InventoryID:    item.InventoryID,
			QuantityBase:   qty,
			Type:           movementType,
			Reason:         reason,
			UnitCostMicros: item.UnitCostMicros,
			ReferenceType:  domain.RefPurchase,
			ReferenceID:    &refID,
		})
		if err != nil {
			return err
		}
	}
	return nil
}
