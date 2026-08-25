package domain

import "github.com/google/uuid"

// Inventory is a raw ingredient / consumable held in stock.
//
// Stock is always expressed in the item's BASE unit (see units.go). The legacy
// json keys (`unit`, `stock`, `minimum_stock`, `purchase_price`, `supplier`)
// are intentionally preserved so existing POS and Admin clients keep working;
// `unit` now carries the base unit and the purchasing side is described by
// `purchase_unit` + `units_per_purchase`.
type Inventory struct {
	BaseModel
	Name string `gorm:"size:120;not null;index" json:"name"`
	// Category groups items in the Admin UI (Dairy, Meat, Vegetables, ...).
	Category string `gorm:"size:100;not null;default:''" json:"category"`

	// UnitKind drives the base unit: WEIGHT->g, VOLUME->ml, COUNT->pcs.
	UnitKind string `gorm:"size:20;not null;default:'WEIGHT'" json:"unit_kind"`
	// Unit is the BASE unit the stock is counted in (g / ml / pcs).
	Unit string `gorm:"size:30;not null" json:"unit"`
	// PurchaseUnit is how the owner buys the item (KG, Litre, Carton, Packet).
	PurchaseUnit string `gorm:"size:30;not null;default:''" json:"purchase_unit"`
	// UnitsPerPurchase is how many BASE units one purchase unit contains.
	// e.g. Cheese bought in KG, counted in g -> 1000.
	UnitsPerPurchase int64 `gorm:"not null;default:1" json:"units_per_purchase"`

	// Stock is the quantity on hand in BASE units. Allowed to go negative so a
	// sale is never blocked at the counter; negative values are surfaced as
	// alerts for the owner to reconcile.
	Stock int64 `gorm:"not null;default:0" json:"stock"`
	// MinimumStock is the reorder threshold in BASE units.
	MinimumStock int64 `gorm:"not null;default:0" json:"minimum_stock"`

	// AvgCostMicros is the weighted-average cost of one BASE unit, in
	// micro-Rupees. This is the number used to value stock and compute COGS.
	AvgCostMicros int64 `gorm:"not null;default:0" json:"avg_cost_micros"`
	// PurchasePrice is the most recent price paid for ONE purchase unit, in
	// whole Rupees. Kept for backwards compatibility and quick data entry.
	PurchasePrice int `gorm:"not null;default:0" json:"purchase_price"`

	// SupplierID is the preferred supplier. Supplier keeps the old free-text
	// label so older clients and imported data still render something useful.
	SupplierID *uuid.UUID `gorm:"type:uuid;index" json:"supplier_id,omitempty"`
	Supplier   string     `gorm:"size:120;not null;default:''" json:"supplier"`

	// IsActive lets the owner retire an ingredient without deleting history.
	IsActive bool `gorm:"not null;default:true" json:"is_active"`

	Recipes               []Recipe               `gorm:"foreignKey:InventoryID" json:"recipes,omitempty"`
	InventoryTransactions []InventoryTransaction `gorm:"foreignKey:InventoryID" json:"inventory_transactions,omitempty"`
}

// StockValue returns the current worth of this item's stock in whole Rupees.
func (i *Inventory) StockValue() int {
	return ValueFromMicros(i.AvgCostMicros, i.Stock)
}

// IsLow reports whether the item has reached its reorder threshold.
func (i *Inventory) IsLow() bool {
	return i.Stock <= i.MinimumStock
}
