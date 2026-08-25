package domain

import "github.com/google/uuid"

type Customer struct {
	BaseModel
	Name  string `gorm:"size:100;not null" json:"name"`
	Phone string `gorm:"size:20;not null;uniqueIndex" json:"phone"`
	// DefaultAddress / DefaultLocationID speed up checkout autofill.
	DefaultAddress    string     `gorm:"size:500;not null;default:''" json:"default_address"`
	DefaultLocationID *uuid.UUID `gorm:"type:uuid;index" json:"default_location_id,omitempty"`
}
