package domain

type Setting struct {
	BaseModel
	RestaurantName    string `gorm:"size:150;not null" json:"restaurant_name"`
	Phone             string `gorm:"size:20;not null" json:"phone"`
	WhatsApp          string `gorm:"size:20" json:"whatsapp"`
	Logo              string `gorm:"size:500" json:"logo"`
	Address           string `gorm:"size:500" json:"address"`
	OpeningTime       string `gorm:"size:20" json:"opening_time"`
	ClosingTime       string `gorm:"size:20" json:"closing_time"`
	CashOnDeliveryFee int    `gorm:"not null;default:0" json:"cash_on_delivery_fee"`
	Currency          string `gorm:"size:10;not null;default:'Rs'" json:"currency"`
	GoogleMaps        string `gorm:"size:500" json:"google_maps"`
	Facebook          string `gorm:"size:500" json:"facebook"`
	Instagram         string `gorm:"size:500" json:"instagram"`
	// DrinkFlavors is a JSON string array of soft-drink brands in stock
	// (e.g. ["Coke","Sprite","Fanta"]). Shop owners add/remove flavors here.
	DrinkFlavors string `gorm:"type:text" json:"drink_flavors"`
	// DefaultSiteTheme is the first-visit website appearance:
	// dark | dim | light | warm
	DefaultSiteTheme string `gorm:"size:20;not null;default:'dark'" json:"default_site_theme"`
}
