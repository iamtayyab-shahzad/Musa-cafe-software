package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"backend/internal/config"
	"backend/internal/database"
	"backend/internal/domain"

	"gorm.io/gorm"
)

type seedFile struct {
	Items []seedItem `json:"items"`
}

type seedItem struct {
	Name             string `json:"name"`
	Category         string `json:"category"`
	UnitKind         string `json:"unit_kind"`
	PurchaseUnit     string `json:"purchase_unit"`
	UnitsPerPurchase int64  `json:"units_per_purchase"`
	MinimumStock     int64  `json:"minimum_stock"`
	PurchasePrice    int    `json:"purchase_price"`
}

func main() {
	pathFlag := flag.String("file", "", "path to inventory.json (default: ../shared/inventory.json)")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	db, err := database.Initialize(cfg.Database)
	if err != nil {
		log.Fatalf("database: %v", err)
	}

	path := *pathFlag
	if path == "" {
		path = filepath.Join("..", "shared", "inventory.json")
		if _, err := os.Stat(path); err != nil {
			path = filepath.Join("shared", "inventory.json")
		}
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("read %s: %v", path, err)
	}
	var file seedFile
	if err := json.Unmarshal(raw, &file); err != nil {
		log.Fatalf("parse: %v", err)
	}
	if len(file.Items) == 0 {
		log.Fatal("no items in seed file")
	}

	created, updated := 0, 0
	err = db.Transaction(func(tx *gorm.DB) error {
		for _, item := range file.Items {
			name := strings.TrimSpace(item.Name)
			if name == "" {
				continue
			}
			kind := domain.NormalizeUnitKind(item.UnitKind)
			base := domain.BaseUnitForKind(kind)
			units := item.UnitsPerPurchase
			if units <= 0 {
				units = domain.DefaultUnitsPerPurchase(item.PurchaseUnit)
			}
			purchaseUnit := strings.TrimSpace(item.PurchaseUnit)
			if purchaseUnit == "" {
				purchaseUnit = base
			}

			var existing domain.Inventory
			findErr := tx.Where("LOWER(name) = ?", strings.ToLower(name)).First(&existing).Error
			if findErr == nil {
				if err := tx.Model(&existing).Updates(map[string]any{
					"category":           item.Category,
					"unit_kind":          kind,
					"unit":               base,
					"purchase_unit":      purchaseUnit,
					"units_per_purchase": units,
					"minimum_stock":      item.MinimumStock,
					"is_active":          true,
				}).Error; err != nil {
					return err
				}
				updated++
				continue
			}
			if findErr != gorm.ErrRecordNotFound {
				return findErr
			}

			row := domain.Inventory{
				Name:             name,
				Category:         item.Category,
				UnitKind:         kind,
				Unit:             base,
				PurchaseUnit:     purchaseUnit,
				UnitsPerPurchase: units,
				MinimumStock:     item.MinimumStock,
				PurchasePrice:    item.PurchasePrice,
				IsActive:         true,
			}
			if item.PurchasePrice > 0 && units > 0 {
				row.AvgCostMicros = (int64(item.PurchasePrice) * domain.CostScale) / units
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
			created++
		}
		return nil
	})
	if err != nil {
		log.Fatalf("seed: %v", err)
	}
	fmt.Printf("Inventory seed complete: %d created, %d updated (from %s)\n", created, updated, path)
}
