package domain

import "github.com/google/uuid"

type ProductSize struct {
	BaseModel
	ProductID uuid.UUID `gorm:"type:uuid;not null;index" json:"product_id"`
	Product   Product   `gorm:"foreignKey:ProductID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"product,omitempty"`
	Size      string    `gorm:"size:30;not null" json:"size"`
	Price     int       `gorm:"not null" json:"price"`
	// WasPrice is the pre-deal / compare-at price used to show "Save Rs …" on flyers.
	WasPrice int `gorm:"not null;default:0" json:"was_price"`
}
