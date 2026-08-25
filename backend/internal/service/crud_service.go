package service

import (
	"backend/internal/repository"

	"github.com/google/uuid"
)

type CRUDService[T any] struct {
	repo *repository.GenericRepository[T]
}

func NewCRUDService[T any](repo *repository.GenericRepository[T]) *CRUDService[T] {
	return &CRUDService[T]{repo: repo}
}

func (s *CRUDService[T]) Create(model *T) error {
	return s.repo.Create(model)
}

func (s *CRUDService[T]) GetByID(id uuid.UUID) (*T, error) {
	return s.repo.GetByID(id)
}

func (s *CRUDService[T]) List() ([]T, error) {
	return s.repo.List()
}

func (s *CRUDService[T]) ListPaged(limit, offset int) ([]T, int64, error) {
	return s.repo.ListPaged(limit, offset)
}

func (s *CRUDService[T]) Update(id uuid.UUID, updates map[string]any) error {
	return s.repo.Update(id, updates)
}

func (s *CRUDService[T]) Delete(id uuid.UUID) error {
	return s.repo.Delete(id)
}
