package domain

import "github.com/google/uuid"

type Order struct {
	BaseModel
	OrderNumber   string `gorm:"size:30" json:"order_number"`
	// BusinessDate is Asia/Karachi calendar day YYYY-MM-DD for daily tokens.
	BusinessDate string `gorm:"size:10;index:idx_orders_daily,priority:1" json:"business_date"`
	// DailyNumber is the shop-facing token 1,2,3… reset each business day.
	DailyNumber   int         `gorm:"not null;default:0;index:idx_orders_daily,priority:2" json:"daily_number"`
	ClientOrderID *uuid.UUID  `gorm:"type:uuid;uniqueIndex" json:"client_order_id,omitempty"`
	CustomerID      *uuid.UUID  `gorm:"type:uuid;index" json:"customer_id,omitempty"`
	Customer        *Customer   `gorm:"foreignKey:CustomerID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL" json:"customer,omitempty"`
	CustomerName    string      `gorm:"size:120;not null" json:"customer_name"`
	Phone           string      `gorm:"size:20;not null" json:"phone"`
	Address         string      `gorm:"size:500;not null" json:"address"`
	LocationID      uuid.UUID   `gorm:"type:uuid;not null;index" json:"location_id"`
	Location        Location    `gorm:"foreignKey:LocationID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"location,omitempty"`
	DeliveryCharge  int         `gorm:"not null;default:0" json:"delivery_charge"`
	CashOnDeliveryFee int       `gorm:"not null;default:0" json:"cash_on_delivery_fee"`
	PaymentMethod   string      `gorm:"size:50;not null" json:"payment_method"`
	OrderStatus     string      `gorm:"size:50;not null;index" json:"order_status"`
	OrderType       string      `gorm:"size:30;not null;default:'website';index" json:"order_type"`
	OrderNotes      string      `gorm:"type:text" json:"order_notes"`
	Subtotal        int         `gorm:"not null;default:0" json:"subtotal"`
	// Discount is order-level promo (e.g. Fri & Sun 10% on non-deal items).
	Discount   int `gorm:"not null;default:0" json:"discount"`
	GrandTotal int `gorm:"not null;default:0" json:"grand_total"`
	Items           []OrderItem `gorm:"foreignKey:OrderID" json:"items,omitempty"`
	Payment         *Payment    `gorm:"foreignKey:OrderID" json:"payment,omitempty"`
}
