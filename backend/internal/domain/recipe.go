package domain

import "github.com/google/uuid"

// Recipe is one ingredient line of a product's bill of materials.
//
// ProductSizeID makes the BOM size-aware: a Large pizza consumes more cheese
// than a Small one. Resolution rules used when an order is completed:
//
//	1. If lines exist for the exact (product, size), use them.
//	2. Otherwise fall back to the product's size-agnostic lines (ProductSizeID
//	   NULL), which is also what pre-existing rows are treated as.
//
// A product with no lines at all simply consumes nothing — recipes are never
// mandatory, so drinks and un-costed items still sell normally.
type Recipe struct {
	BaseModel
	ProductID uuid.UUID `gorm:"type:uuid;not null;index" json:"product_id"`
	Product   Product   `gorm:"foreignKey:ProductID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"product,omitempty"`

	// ProductSizeID is nil for a size-agnostic line that applies to every size.
	ProductSizeID *uuid.UUID   `gorm:"type:uuid;index" json:"product_size_id,omitempty"`
	ProductSize   *ProductSize `gorm:"foreignKey:ProductSizeID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"product_size,omitempty"`

	InventoryID uuid.UUID `gorm:"type:uuid;not null;index" json:"inventory_id"`
	Inventory   Inventory `gorm:"foreignKey:InventoryID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"inventory,omitempty"`

	// QuantityRequired is per single unit of the product, in the ingredient's
	// BASE unit (grams / ml / pieces).
	QuantityRequired int64 `gorm:"not null" json:"quantity_required"`
}
