package service

import (
	"net/http"

	"backend/internal/domain"
	"backend/internal/dto"
	"backend/internal/repository"
	"backend/internal/utils"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type PaymentService struct {
	repo      *repository.PaymentRepository
	orderRepo *repository.OrderRepository
}

func NewPaymentService(db *gorm.DB) *PaymentService {
	return &PaymentService{
		repo:      repository.NewPaymentRepository(db),
		orderRepo: repository.NewOrderRepository(db),
	}
}

func (s *PaymentService) Create(input dto.CreatePaymentRequest) (*domain.Payment, error) {
	if _, err := s.orderRepo.GetByID(input.OrderID); err != nil {
		return nil, utils.NewAppError(http.StatusBadRequest, "invalid order")
	}
	if existing, err := s.repo.GetByOrderID(input.OrderID); err == nil && existing != nil {
		return nil, utils.NewAppError(http.StatusConflict, "payment already exists for order")
	}

	payment := &domain.Payment{
		OrderID:   input.OrderID,
		Method:    input.Method,
		Amount:    input.Amount,
		Status:    input.Status,
		Reference: input.Reference,
	}
	if err := s.repo.Create(nil, payment); err != nil {
		return nil, err
	}
	return s.repo.GetByID(payment.ID)
}

func (s *PaymentService) List() ([]domain.Payment, error) {
	return s.repo.List()
}

func (s *PaymentService) ListPaged(limit, offset int) ([]domain.Payment, int64, error) {
	return s.repo.ListPaged(limit, offset)
}

func (s *PaymentService) GetByID(id uuid.UUID) (*domain.Payment, error) {
	return s.repo.GetByID(id)
}

func (s *PaymentService) Update(id uuid.UUID, input dto.UpdatePaymentRequest) (*domain.Payment, error) {
	updates := map[string]any{}
	if input.Method != nil {
		updates["method"] = *input.Method
	}
	if input.Amount != nil {
		updates["amount"] = *input.Amount
	}
	if input.Status != nil {
		updates["status"] = *input.Status
	}
	if input.Reference != nil {
		updates["reference"] = *input.Reference
	}
	if len(updates) == 0 {
		return nil, utils.NewAppError(http.StatusBadRequest, "no fields to update")
	}
	if err := s.repo.Update(id, updates); err != nil {
		return nil, err
	}
	return s.repo.GetByID(id)
}

func (s *PaymentService) Delete(id uuid.UUID) error {
	return s.repo.Delete(id)
}
