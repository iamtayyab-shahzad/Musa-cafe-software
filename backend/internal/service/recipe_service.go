package service

import (
	"net/http"

	"backend/internal/domain"
	"backend/internal/utils"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type RecipeService struct {
	db *gorm.DB
}

func NewRecipeService(db *gorm.DB) *RecipeService {
	return &RecipeService{db: db}
}

type RecipeLineInput struct {
	InventoryID      uuid.UUID  `json:"inventory_id"`
	QuantityRequired int64      `json:"quantity_required"`
	ProductSizeID    *uuid.UUID `json:"product_size_id"`
}

type RecipeSetInput struct {
	ProductID     uuid.UUID         `json:"product_id"`
	ProductSizeID *uuid.UUID        `json:"product_size_id"`
	Lines         []RecipeLineInput `json:"lines"`
}

// List returns every BOM line with product + inventory names hydrated.
func (s *RecipeService) List() ([]domain.Recipe, error) {
	var rows []domain.Recipe
	err := s.db.Preload("Product").Preload("ProductSize").Preload("Inventory").
		Order("product_id, product_size_id nulls first").
		Find(&rows).Error
	return rows, err
}

func (s *RecipeService) ListPaged(limit, offset int) ([]domain.Recipe, int64, error) {
	var total int64
	var rows []domain.Recipe
	if err := s.db.Model(&domain.Recipe{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	q := s.db.Preload("Product").Preload("ProductSize").Preload("Inventory").
		Order("product_id, product_size_id nulls first")
	if offset > 0 {
		q = q.Offset(offset)
	}
	if limit > 0 {
		q = q.Limit(limit)
	}
	if err := q.Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// ListByProduct returns BOM lines for one product.
func (s *RecipeService) ListByProduct(productID uuid.UUID) ([]domain.Recipe, error) {
	var rows []domain.Recipe
	err := s.db.Preload("Inventory").Preload("ProductSize").
		Where("product_id = ?", productID).
		Find(&rows).Error
	return rows, err
}

// Create adds a single BOM line.
func (s *RecipeService) Create(line RecipeLineInput, productID uuid.UUID) (*domain.Recipe, error) {
	if productID == uuid.Nil {
		return nil, utils.NewAppError(http.StatusBadRequest, "product_id is required")
	}
	if line.InventoryID == uuid.Nil {
		return nil, utils.NewAppError(http.StatusBadRequest, "inventory_id is required")
	}
	if line.QuantityRequired <= 0 {
		return nil, utils.NewAppError(http.StatusBadRequest, "quantity must be greater than zero")
	}
	row := &domain.Recipe{
		ProductID:        productID,
		ProductSizeID:    line.ProductSizeID,
		InventoryID:      line.InventoryID,
		QuantityRequired: line.QuantityRequired,
	}
	if err := s.db.Create(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

// Update edits one BOM line.
func (s *RecipeService) Update(id uuid.UUID, line RecipeLineInput) error {
	updates := map[string]any{}
	if line.InventoryID != uuid.Nil {
		updates["inventory_id"] = line.InventoryID
	}
	if line.QuantityRequired > 0 {
		updates["quantity_required"] = line.QuantityRequired
	}
	updates["product_size_id"] = line.ProductSizeID
	return s.db.Model(&domain.Recipe{}).Where("id = ?", id).Updates(updates).Error
}

func (s *RecipeService) Delete(id uuid.UUID) error {
	return s.db.Where("id = ?", id).Delete(&domain.Recipe{}).Error
}

// ReplaceSet atomically replaces all BOM lines for a (product, size) pair.
// Passing an empty Lines list clears the recipe — which is intentional so the
// owner can wipe a misconfigured size without deleting the product.
func (s *RecipeService) ReplaceSet(in RecipeSetInput) ([]domain.Recipe, error) {
	if in.ProductID == uuid.Nil {
		return nil, utils.NewAppError(http.StatusBadRequest, "product_id is required")
	}

	var product domain.Product
	if err := s.db.First(&product, "id = ?", in.ProductID).Error; err != nil {
		return nil, utils.NewAppError(http.StatusBadRequest, "product not found")
	}
	if in.ProductSizeID != nil {
		var size domain.ProductSize
		if err := s.db.First(&size, "id = ? AND product_id = ?", *in.ProductSizeID, in.ProductID).Error; err != nil {
			return nil, utils.NewAppError(http.StatusBadRequest, "product size does not belong to this product")
		}
	}

	if len(in.Lines) > 0 {
		valid := 0
		for _, line := range in.Lines {
			if line.InventoryID != uuid.Nil && line.QuantityRequired > 0 {
				valid++
			}
		}
		if valid == 0 {
			return nil, utils.NewAppError(http.StatusBadRequest, "recipe lines need a valid inventory item and quantity > 0")
		}
		if valid != len(in.Lines) {
			return nil, utils.NewAppError(http.StatusBadRequest, "every recipe line needs a valid inventory item and quantity > 0")
		}
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		q := tx.Where("product_id = ?", in.ProductID)
		if in.ProductSizeID == nil {
			q = q.Where("product_size_id IS NULL")
		} else {
			q = q.Where("product_size_id = ?", *in.ProductSizeID)
		}
		if err := q.Delete(&domain.Recipe{}).Error; err != nil {
			return err
		}
		for _, line := range in.Lines {
			row := domain.Recipe{
				ProductID:        in.ProductID,
				ProductSizeID:    in.ProductSizeID,
				InventoryID:      line.InventoryID,
				QuantityRequired: line.QuantityRequired,
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.ListByProduct(in.ProductID)
}
