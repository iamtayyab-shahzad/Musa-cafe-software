package domain

import "time"

type Offer struct {
	BaseModel
	Title       string     `gorm:"size:150;not null" json:"title"`
	Description string     `gorm:"type:text" json:"description"`
	Image       string     `gorm:"type:text" json:"image"`
	Active      bool       `gorm:"not null;default:true" json:"active"`
	OfferPopup    bool   `gorm:"not null;default:false" json:"offer_popup"`
	HomepageDeal  bool   `gorm:"not null;default:false" json:"homepage_deal"`
	DiscountLabel string `gorm:"size:120;not null;default:''" json:"discount_label"`
	StartDate   *time.Time `json:"start_date"`
	EndDate     *time.Time `json:"end_date"`
}
