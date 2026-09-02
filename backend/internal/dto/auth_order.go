package dto

import (
	"time"

	"github.com/google/uuid"
)

type StaffLoginRequest struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Password string `json:"password" binding:"required,min=4"`
}

type CustomerRegisterRequest struct {
	Name     string `json:"name" binding:"required,min=2,max=100"`
	Phone    string `json:"phone" binding:"required,min=10,max=20"`
	Password string `json:"password" binding:"required,min=6,max=72"`
}

type CustomerLoginRequest struct {
	Phone    string `json:"phone" binding:"required,min=10,max=20"`
	Password string `json:"password" binding:"required"`
}

type CreateOrderItemRequest struct {
	ProductID     uuid.UUID `json:"product_id" binding:"required"`
	ProductSizeID uuid.UUID `json:"product_size_id" binding:"required"`
	Quantity      int       `json:"quantity" binding:"required,min=1"`
	// Price is honoured only for staff orders when the product allows manual pricing.
	Price               *int   `json:"price" binding:"omitempty,min=1"`
	SpecialInstructions string `json:"special_instructions" binding:"max=1000"`
}

type CreateOrderRequest struct {
	CustomerName  string                   `json:"customer_name" binding:"required,min=2,max=120"`
	Phone         string                   `json:"phone" binding:"required,min=7,max=20"`
	Address       string                   `json:"address" binding:"max=500"`
	// LocationID is required for delivery orders. Walk-in may omit it; the
	// service falls back to the seeded "In Store (Walk-in)" location.
	LocationID uuid.UUID `json:"location_id"`
	PaymentMethod string                   `json:"payment_method" binding:"required,oneof=cash easypaisa jazzcash card bank cod"`
	OrderNotes    string                   `json:"order_notes" binding:"max=2000"`
	ClientOrderID *uuid.UUID               `json:"client_order_id"`
	// CreatedAt is the original till timestamp. If omitted, server time is used.
	CreatedAt *time.Time `json:"created_at"`
	// DailyNumber / BusinessDate are optional POS hints for offline-assigned
	// shop tokens. Server prefers them when free; otherwise assigns next.
	DailyNumber  *int    `json:"daily_number"`
	BusinessDate *string `json:"business_date"`
	IsGuest      bool    `json:"is_guest"`
	Items        []CreateOrderItemRequest `json:"items" binding:"required,min=1,dive"`
}

type UpdateOrderRequest struct {
	CustomerName  *string                   `json:"customer_name" binding:"omitempty,min=2,max=120"`
	Phone         *string                   `json:"phone" binding:"omitempty,min=7,max=20"`
	Address       *string                   `json:"address" binding:"omitempty,max=500"`
	LocationID    *uuid.UUID                `json:"location_id"`
	PaymentMethod *string                   `json:"payment_method" binding:"omitempty,oneof=cash easypaisa jazzcash card bank cod"`
	OrderNotes    *string                   `json:"order_notes" binding:"omitempty,max=2000"`
	OrderStatus   *string                   `json:"order_status" binding:"omitempty,oneof=PENDING COMPLETED CANCELLED"`
	Items         *[]CreateOrderItemRequest `json:"items" binding:"omitempty,min=1,dive"`
}

type CreatePaymentRequest struct {
	OrderID   uuid.UUID `json:"order_id" binding:"required"`
	Method    string    `json:"method" binding:"required,oneof=cash easypaisa jazzcash card bank cod"`
	Amount    int       `json:"amount" binding:"required,min=0"`
	Status    string    `json:"status" binding:"required,oneof=pending paid failed refunded"`
	Reference string    `json:"reference" binding:"max=120"`
}

type UpdatePaymentRequest struct {
	Method    *string `json:"method" binding:"omitempty,oneof=cash easypaisa jazzcash card bank cod"`
	Amount    *int    `json:"amount" binding:"omitempty,min=0"`
	Status    *string `json:"status" binding:"omitempty,oneof=pending paid failed refunded"`
	Reference *string `json:"reference" binding:"omitempty,max=120"`
}

type UpdateSettingsRequest struct {
	RestaurantName    *string `json:"restaurant_name" binding:"omitempty,min=2,max=150"`
	Phone             *string `json:"phone" binding:"omitempty,max=20"`
	WhatsApp          *string `json:"whatsapp" binding:"omitempty,max=20"`
	Logo              *string `json:"logo" binding:"omitempty,max=500"`
	Address           *string `json:"address" binding:"omitempty,max=500"`
	OpeningTime       *string `json:"opening_time" binding:"omitempty,max=20"`
	ClosingTime       *string `json:"closing_time" binding:"omitempty,max=20"`
	CashOnDeliveryFee *int    `json:"cash_on_delivery_fee" binding:"omitempty,min=0"`
	Currency          *string `json:"currency" binding:"omitempty,max=10"`
	GoogleMaps        *string `json:"google_maps" binding:"omitempty,max=500"`
	Facebook          *string `json:"facebook" binding:"omitempty,max=500"`
	Instagram         *string `json:"instagram" binding:"omitempty,max=500"`
	DrinkFlavors      *string `json:"drink_flavors" binding:"omitempty,max=2000"`
	DefaultSiteTheme  *string `json:"default_site_theme" binding:"omitempty,oneof=dark dim light warm"`
	PosOneClickComplete   *bool   `json:"pos_one_click_complete"`
	PosAllowHistoryEdit   *bool   `json:"pos_allow_history_edit"`
}

type TokenResponse struct {
	Token string `json:"token"`
}

type AuthCustomerResponse struct {
	Customer any    `json:"customer"`
	Token    string `json:"token"`
}

type UpdateCustomerProfileRequest struct {
	Name              *string    `json:"name" binding:"omitempty,min=2,max=100"`
	DefaultAddress    *string    `json:"default_address" binding:"omitempty,max=500"`
	DefaultLocationID *uuid.UUID `json:"default_location_id"`
}

type CustomerResetPasswordRequest struct {
	Token    string `json:"token" binding:"required,min=32,max=128"`
	Password string `json:"password" binding:"required,min=6,max=72"`
}
