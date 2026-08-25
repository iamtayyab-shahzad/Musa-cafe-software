package domain

type Location struct {
	BaseModel
	Name           string  `gorm:"size:100;not null" json:"name"`
	DeliveryCharge int     `gorm:"not null;default:0" json:"delivery_charge"`
	Orders         []Order `gorm:"foreignKey:LocationID" json:"orders,omitempty"`
}
