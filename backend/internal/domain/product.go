package domain

import "github.com/google/uuid"

type Product struct {
	BaseModel
	CategoryID   uuid.UUID     `gorm:"type:uuid;not null;index" json:"category_id"`
	Category     Category      `gorm:"foreignKey:CategoryID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"category,omitempty"`
	Name         string        `gorm:"size:150;not null" json:"name"`
	Description  string        `gorm:"type:text" json:"description"`
	Image        string        `gorm:"type:text" json:"image"`
	Featured          bool          `gorm:"not null;default:false" json:"featured"`
	Available         bool          `gorm:"not null;default:true" json:"available"`
	AllowManualPrice  bool          `gorm:"not null;default:false" json:"allow_manual_price"`
	DisplayOrder      int           `gorm:"not null;default:0" json:"display_order"`
	Sizes        []ProductSize `gorm:"foreignKey:ProductID" json:"sizes,omitempty"`
}
