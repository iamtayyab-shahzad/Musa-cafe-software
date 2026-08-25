package service

import (
	"net/http"

	"backend/internal/domain"
	"backend/internal/utils"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CatalogService owns delete operations that must cascade to dependent catalog
// rows. The generic CRUD delete cannot do this safely because product sizes and
// recipes reference products, and products reference categories.
type CatalogService struct {
	db *gorm.DB
}

func NewCatalogService(db *gorm.DB) *CatalogService {
	return &CatalogService{db: db}
}

// DeleteProduct removes a product together with its sizes and recipes.
// Products that appear in existing orders are protected so order history stays intact.
func (s *CatalogService) DeleteProduct(id uuid.UUID) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		return s.deleteProductTx(tx, id)
	})
}

// DeleteProductSize removes a size only when no order line references it.
func (s *CatalogService) DeleteProductSize(id uuid.UUID) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var size domain.ProductSize
		if err := tx.First(&size, "id = ?", id).Error; err != nil {
			return err
		}
		var orderRefs int64
		if err := tx.Model(&domain.OrderItem{}).Where("product_size_id = ?", id).Count(&orderRefs).Error; err != nil {
			return err
		}
		if orderRefs > 0 {
			return utils.NewAppError(http.StatusConflict, "cannot delete a size used on existing orders; change the price instead")
		}
		return tx.Where("id = ?", id).Delete(&domain.ProductSize{}).Error
	})
}

func (s *CatalogService) deleteProductTx(tx *gorm.DB, id uuid.UUID) error {
	var product domain.Product
	if err := tx.First(&product, "id = ?", id).Error; err != nil {
		return err
	}

	var orderRefs int64
	if err := tx.Model(&domain.OrderItem{}).Where("product_id = ?", id).Count(&orderRefs).Error; err != nil {
		return err
	}
	if orderRefs > 0 {
		return utils.NewAppError(http.StatusConflict, "cannot delete a product that appears in existing orders; mark it unavailable instead")
	}

	if err := tx.Where("product_id = ?", id).Delete(&domain.Recipe{}).Error; err != nil {
		return err
	}
	if err := tx.Where("product_id = ?", id).Delete(&domain.ProductSize{}).Error; err != nil {
		return err
	}
	return tx.Where("id = ?", id).Delete(&domain.Product{}).Error
}

// DeleteCategory removes a category and cascades to its products (with their
// sizes and recipes). Categories whose products appear in existing orders are protected.
func (s *CatalogService) DeleteCategory(id uuid.UUID) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var category domain.Category
		if err := tx.First(&category, "id = ?", id).Error; err != nil {
			return err
		}

		var products []domain.Product
		if err := tx.Where("category_id = ?", id).Find(&products).Error; err != nil {
			return err
		}

		productIDs := make([]uuid.UUID, 0, len(products))
		for _, p := range products {
			productIDs = append(productIDs, p.ID)
		}
		if len(productIDs) > 0 {
			var orderRefs int64
			if err := tx.Model(&domain.OrderItem{}).Where("product_id IN ?", productIDs).Count(&orderRefs).Error; err != nil {
				return err
			}
			if orderRefs > 0 {
				return utils.NewAppError(http.StatusConflict, "cannot delete a category whose products appear in existing orders")
			}
		}

		for _, p := range products {
			if err := s.deleteProductTx(tx, p.ID); err != nil {
				return err
			}
		}

		return tx.Where("id = ?", id).Delete(&domain.Category{}).Error
	})
}

// DeleteLocation removes a location. Locations referenced by existing orders are
// protected: orders.location_id uses OnDelete:RESTRICT, so a hard delete would
// otherwise fail with a raw FK error that surfaces to the client as HTTP 500.
func (s *CatalogService) DeleteLocation(id uuid.UUID) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var location domain.Location
		if err := tx.First(&location, "id = ?", id).Error; err != nil {
			return err
		}

		var orderRefs int64
		if err := tx.Model(&domain.Order{}).Where("location_id = ?", id).Count(&orderRefs).Error; err != nil {
			return err
		}
		if orderRefs > 0 {
			return utils.NewAppError(http.StatusConflict, "cannot delete a location that is used by existing orders")
		}

		return tx.Where("id = ?", id).Delete(&domain.Location{}).Error
	})
}
