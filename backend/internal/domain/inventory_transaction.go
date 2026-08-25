package domain

import "github.com/google/uuid"

// Stock movement types recorded in the inventory ledger.
const (
	StockPurchase         = "PURCHASE"
	StockConsumption      = "CONSUMPTION"
	StockWastage          = "WASTAGE"
	StockAdjustment       = "ADJUSTMENT"
	StockPurchaseReversal = "PURCHASE_REVERSAL"
	StockOpening          = "OPENING"
)

// Reference document types a movement can point back to.
const (
	RefOrder    = "ORDER"
	RefPurchase = "PURCHASE"
	RefManual   = "MANUAL"
)

// InventoryTransaction is an append-only ledger row. Every change to stock —
// purchase, consumption, wastage, manual correction — writes one of these, so
// the owner can always answer "why is my stock this number?".
type InventoryTransaction struct {
	BaseModel
	InventoryID uuid.UUID `gorm:"type:uuid;not null;index" json:"inventory_id"`
	Inventory   Inventory `gorm:"foreignKey:InventoryID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"inventory,omitempty"`

	// Quantity is the signed change in BASE units (negative = stock left).
	Quantity        int64  `gorm:"not null" json:"quantity"`
	TransactionType string `gorm:"size:50;not null;index" json:"transaction_type"`
	Reason          string `gorm:"type:text" json:"reason"`

	// UnitCostMicros is the cost per base unit applied to this movement, and
	// TotalCost is the resulting money value in whole Rupees. Consumption rows
	// carry the cost used for COGS, so reports never have to re-derive it.
	UnitCostMicros int64 `gorm:"not null;default:0" json:"unit_cost_micros"`
	TotalCost      int   `gorm:"not null;default:0" json:"total_cost"`

	// BalanceAfter is the running stock level after this movement, giving the
	// ledger an auditable trail.
	BalanceAfter int64 `gorm:"not null;default:0" json:"balance_after"`

	// Reference links the movement to the document that caused it.
	ReferenceType string     `gorm:"size:30;not null;default:''" json:"reference_type"`
	ReferenceID   *uuid.UUID `gorm:"type:uuid;index" json:"reference_id,omitempty"`
}
