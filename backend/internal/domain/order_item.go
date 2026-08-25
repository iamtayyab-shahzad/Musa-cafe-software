package domain

import "github.com/google/uuid"

type OrderItem struct {
	BaseModel
	OrderID       uuid.UUID   `gorm:"type:uuid;not null;index" json:"order_id"`
	Order         Order       `gorm:"foreignKey:OrderID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"order,omitempty"`
	ProductID     uuid.UUID   `gorm:"type:uuid;not null;index" json:"product_id"`
	Product       Product     `gorm:"foreignKey:ProductID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"product,omitempty"`
	ProductSizeID uuid.UUID   `gorm:"type:uuid;not null;index" json:"product_size_id"`
	ProductSize   ProductSize `gorm:"foreignKey:ProductSizeID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"product_size,omitempty"`
	Quantity      int         `gorm:"not null;default:1" json:"quantity"`
	Price         int         `gorm:"not null;default:0" json:"price"`
	SpecialInstructions string `gorm:"type:text" json:"special_instructions"`
}
