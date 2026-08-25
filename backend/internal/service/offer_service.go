package service

import (
	"backend/internal/domain"
	"backend/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type OfferService struct {
	crud *CRUDService[domain.Offer]
	repo *repository.GenericRepository[domain.Offer]
}

func NewOfferService(db *gorm.DB) *OfferService {
	repo := repository.NewGenericRepository[domain.Offer](db)
	return &OfferService{crud: NewCRUDService(repo), repo: repo}
}

func (s *OfferService) Create(model *domain.Offer) error            { return s.crud.Create(model) }
func (s *OfferService) GetByID(id uuid.UUID) (*domain.Offer, error) { return s.crud.GetByID(id) }
func (s *OfferService) List() ([]domain.Offer, error)               { return s.crud.List() }
func (s *OfferService) ListPaged(limit, offset int) ([]domain.Offer, int64, error) {
	return s.crud.ListPaged(limit, offset)
}
func (s *OfferService) Update(id uuid.UUID, updates map[string]any) error {
	return s.crud.Update(id, updates)
}
func (s *OfferService) Delete(id uuid.UUID) error { return s.crud.Delete(id) }
func (s *OfferService) Enable(id uuid.UUID) error {
	return s.crud.Update(id, map[string]any{"active": true})
}
func (s *OfferService) Disable(id uuid.UUID) error {
	return s.crud.Update(id, map[string]any{"active": false})
}
