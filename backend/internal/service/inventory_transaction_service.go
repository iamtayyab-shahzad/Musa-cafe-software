package service

import (
	"backend/internal/domain"
	"backend/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type InventoryTransactionService struct {
	repo *repository.InventoryRepository
}

func NewInventoryTransactionService(db *gorm.DB) *InventoryTransactionService {
	return &InventoryTransactionService{
		repo: repository.NewInventoryRepository(db),
	}
}

func (s *InventoryTransactionService) ListTransactions(
	inventoryID *uuid.UUID,
	movementType string,
	limit int,
) ([]domain.InventoryTransaction, error) {
	return s.repo.ListTransactions(inventoryID, movementType, limit)
}

