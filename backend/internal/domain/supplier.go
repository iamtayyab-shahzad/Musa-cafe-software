package domain

// Supplier is a vendor the restaurant buys ingredients from.
type Supplier struct {
	BaseModel
	Name        string `gorm:"size:120;not null;index" json:"name"`
	Phone       string `gorm:"size:30;not null;default:''" json:"phone"`
	Email       string `gorm:"size:120;not null;default:''" json:"email"`
	Address     string `gorm:"size:300;not null;default:''" json:"address"`
	ContactName string `gorm:"size:120;not null;default:''" json:"contact_name"`
	Notes       string `gorm:"type:text" json:"notes"`
	IsActive    bool   `gorm:"not null;default:true" json:"is_active"`
}
