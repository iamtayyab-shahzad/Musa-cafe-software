package database

import (
	"backend/internal/config"
	"fmt"

	"gorm.io/gorm"
)

func Initialize(cfg config.DatabaseConfig) (*gorm.DB, error) {
	db, err := Connect(cfg)
	if err != nil {
		return nil, err
	}
	if err := AutoMigrate(db); err != nil {
		return nil, fmt.Errorf("auto migration failed: %w", err)
	}
	return db, nil
}
