package domain

import (
	"time"

	"github.com/google/uuid"
)

// Purchase status values.
const (
	PurchaseStatusPosted   = "POSTED"
	PurchaseStatusReversed = "REVERSED"
)

// Purchase is a goods-received document: one supplier invoice covering many
// ingredients. Posting a purchase raises stock, records ledger movements and
// recalculates each item's weighted-average cost. Reversing it undoes all of
// that without deleting the paper trail.
type Purchase struct {
	BaseModel
	InvoiceNumber string     `gorm:"size:60;not null;default:''" json:"invoice_number"`
	SupplierID    *uuid.UUID `gorm:"type:uuid;index" json:"supplier_id,omitempty"`
	Supplier      *Supplier  `gorm:"foreignKey:SupplierID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL" json:"supplier,omitempty"`
	// SupplierName is denormalised so historic documents still read correctly
	// if a supplier is later renamed or removed.
	SupplierName string `gorm:"size:120;not null;default:''" json:"supplier_name"`

	PurchaseDate time.Time `gorm:"not null;index" json:"purchase_date"`
	// Totals are whole Rupees.
	Subtotal   int `gorm:"not null;default:0" json:"subtotal"`
	Discount   int `gorm:"not null;default:0" json:"discount"`
	OtherCost  int `gorm:"not null;default:0" json:"other_cost"`
	GrandTotal int `gorm:"not null;default:0" json:"grand_total"`

	PaymentMethod string `gorm:"size:50;not null;default:'cash'" json:"payment_method"`
	// AmountPaid supports partial supplier payments; the balance is payable.
	AmountPaid int    `gorm:"not null;default:0" json:"amount_paid"`
	Status     string `gorm:"size:20;not null;default:'POSTED';index" json:"status"`
	Notes      string `gorm:"type:text" json:"notes"`

	Items []PurchaseItem `gorm:"foreignKey:PurchaseID" json:"items,omitempty"`
}

// Balance is the amount still owed to the supplier, in whole Rupees.
func (p *Purchase) Balance() int {
	if p.Status == PurchaseStatusReversed {
		return 0
	}
	return p.GrandTotal - p.AmountPaid
}

// PurchaseItem is one ingredient line on a purchase document.
type PurchaseItem struct {
	BaseModel
	PurchaseID  uuid.UUID `gorm:"type:uuid;not null;index" json:"purchase_id"`
	InventoryID uuid.UUID `gorm:"type:uuid;not null;index" json:"inventory_id"`
	Inventory   Inventory `gorm:"foreignKey:InventoryID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"inventory,omitempty"`

	// PurchaseUnit / QuantityMicros record what the owner actually typed
	// ("2.5 KG"), scaled by CostScale so fractional purchase quantities survive
	// a round trip without floats.
	PurchaseUnit   string `gorm:"size:30;not null;default:''" json:"purchase_unit"`
	QuantityMicros int64  `gorm:"not null;default:0" json:"quantity_micros"`
	// QuantityBase is the converted quantity in the item's BASE unit. This is
	// what actually moves stock.
	QuantityBase int64 `gorm:"not null;default:0" json:"quantity_base"`

	// UnitPrice is the price of one PURCHASE unit in whole Rupees.
	UnitPrice int `gorm:"not null;default:0" json:"unit_price"`
	// LineTotal is the money for this line in whole Rupees.
	LineTotal int `gorm:"not null;default:0" json:"line_total"`
	// UnitCostMicros is LineTotal spread over QuantityBase, the cost basis fed
	// into the weighted average.
	UnitCostMicros int64 `gorm:"not null;default:0" json:"unit_cost_micros"`
}
