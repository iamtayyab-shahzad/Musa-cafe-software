package repository

import (
	"backend/internal/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type PaymentRepository struct {
	db *gorm.DB
}

func NewPaymentRepository(db *gorm.DB) *PaymentRepository {
	return &PaymentRepository{db: db}
}

func (r *PaymentRepository) DB() *gorm.DB {
	return r.db
}

func (r *PaymentRepository) Create(tx *gorm.DB, payment *domain.Payment) error {
	if tx == nil {
		tx = r.db
	}
	return tx.Create(payment).Error
}

func (r *PaymentRepository) GetByID(id uuid.UUID) (*domain.Payment, error) {
	var payment domain.Payment
	if err := r.db.Preload("Order").First(&payment, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &payment, nil
}

func (r *PaymentRepository) GetByOrderID(orderID uuid.UUID) (*domain.Payment, error) {
	var payment domain.Payment
	if err := r.db.Where("order_id = ?", orderID).First(&payment).Error; err != nil {
		return nil, err
	}
	return &payment, nil
}

func (r *PaymentRepository) List() ([]domain.Payment, error) {
	rows, _, err := r.ListPaged(0, 0)
	return rows, err
}

func (r *PaymentRepository) ListPaged(limit, offset int) ([]domain.Payment, int64, error) {
	var total int64
	var payments []domain.Payment
	if err := r.db.Model(&domain.Payment{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	q := r.db.Order("created_at desc")
	if offset > 0 {
		q = q.Offset(offset)
	}
	if limit > 0 {
		q = q.Limit(limit)
	}
	if err := q.Find(&payments).Error; err != nil {
		return nil, 0, err
	}
	return payments, total, nil
}

func (r *PaymentRepository) Update(id uuid.UUID, updates map[string]any) error {
	return r.db.Model(&domain.Payment{}).Where("id = ?", id).Updates(updates).Error
}

func (r *PaymentRepository) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Payment{}, "id = ?", id).Error
}
