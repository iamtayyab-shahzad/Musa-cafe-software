package domain

type Category struct {
	BaseModel
	Name         string    `gorm:"size:100;not null" json:"name"`
	Image        string    `gorm:"type:text" json:"image"`
	DisplayOrder int       `gorm:"not null;default:0" json:"display_order"`
	Visible      bool      `gorm:"not null;default:true" json:"visible"`
	Products     []Product `gorm:"foreignKey:CategoryID" json:"products,omitempty"`
}
