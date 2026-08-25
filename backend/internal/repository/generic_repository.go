package repository

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type GenericRepository[T any] struct {
	db *gorm.DB
}

func NewGenericRepository[T any](db *gorm.DB) *GenericRepository[T] {
	return &GenericRepository[T]{db: db}
}

func (r *GenericRepository[T]) Create(entity *T) error {
	return r.db.Create(entity).Error
}

func (r *GenericRepository[T]) GetByID(id uuid.UUID) (*T, error) {
	var model T
	if err := r.db.First(&model, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &model, nil
}

func (r *GenericRepository[T]) List() ([]T, error) {
	var models []T
	if err := r.db.Find(&models).Error; err != nil {
		return nil, err
	}
	return models, nil
}

// ListPaged returns a slice window plus the total row count. limit <= 0 means
// "no limit" (return everything from offset).
func (r *GenericRepository[T]) ListPaged(limit, offset int) ([]T, int64, error) {
	var total int64
	var models []T
	if err := r.db.Model(new(T)).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	q := r.db.Model(new(T))
	if offset > 0 {
		q = q.Offset(offset)
	}
	if limit > 0 {
		q = q.Limit(limit)
	}
	if err := q.Find(&models).Error; err != nil {
		return nil, 0, err
	}
	return models, total, nil
}

func (r *GenericRepository[T]) Update(id uuid.UUID, updates map[string]any) error {
	var model T
	return r.db.Model(&model).Where("id = ?", id).Updates(NormalizeJSONUpdates(updates)).Error
}

func (r *GenericRepository[T]) Delete(id uuid.UUID) error {
	var model T
	return r.db.Where("id = ?", id).Delete(&model).Error
}
