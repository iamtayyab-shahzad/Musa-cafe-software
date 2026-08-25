package domain

type User struct {
	BaseModel
	Name     string `gorm:"size:100;not null" json:"name"`
	Username string `gorm:"size:50;not null;uniqueIndex" json:"username"`
	Password string `gorm:"size:255;not null" json:"-"`
	Role     string `gorm:"size:20;not null;default:'staff';index" json:"role"`
}
