package domain

import "github.com/google/uuid"

type Payment struct {
	BaseModel
	OrderID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex" json:"order_id"`
	Order     *Order    `gorm:"foreignKey:OrderID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"order,omitempty"`
	Method    string    `gorm:"size:50;not null" json:"method"`
	Amount    int       `gorm:"not null;default:0" json:"amount"`
	Status    string    `gorm:"size:50;not null;index" json:"status"`
	Reference string    `gorm:"size:120" json:"reference"`
}
