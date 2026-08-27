package main

import (
	"fmt"
	"log"
	"os"
	"time"

	"backend/internal/config"
	"backend/internal/database"
	"backend/internal/domain"
	"backend/internal/utils"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type seedUser struct {
	Username string
	Password string
	Name     string
}

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	db, err := database.Connect(cfg.Database)
	if err != nil {
		log.Fatalf("db: %v", err)
	}

	if err := database.AutoMigrate(db); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	users := []seedUser{
		{
			Username: envOr("SEED_USERNAME", "admin"),
			Password: envOr("SEED_PASSWORD", "musacafe321"),
			Name:     envOr("SEED_NAME", "Admin"),
		},
		{
			Username: envOr("SEED_STAFF_USERNAME", "staff"),
			Password: envOr("SEED_STAFF_PASSWORD", "musacafe123"),
			Name:     envOr("SEED_STAFF_NAME", "Counter Staff"),
		},
	}

	for _, u := range users {
		if err := upsertStaff(db, u); err != nil {
			log.Fatalf("seed %s: %v", u.Username, err)
		}
	}
}

func upsertStaff(db *gorm.DB, u seedUser) error {
	hashed, err := utils.HashPassword(u.Password)
	if err != nil {
		return err
	}

	var existing domain.User
	err = db.Where("username = ?", u.Username).First(&existing).Error
	if err == nil {
		if err := db.Model(&existing).Updates(map[string]any{
			"password":   hashed,
			"name":       u.Name,
			"role":       "staff",
			"updated_at": time.Now(),
		}).Error; err != nil {
			return err
		}
		fmt.Printf("Updated staff user: username=%s role=staff\n", u.Username)
		return nil
	}
	if err != gorm.ErrRecordNotFound {
		return err
	}

	user := domain.User{
		BaseModel: domain.BaseModel{
			ID:        uuid.New(),
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		},
		Name:     u.Name,
		Username: u.Username,
		Password: hashed,
		Role:     "staff",
	}
	if err := db.Create(&user).Error; err != nil {
		return err
	}
	fmt.Printf("Created staff user: username=%s role=staff\n", u.Username)
	return nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
