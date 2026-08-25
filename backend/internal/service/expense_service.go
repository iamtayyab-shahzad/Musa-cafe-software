package service

import (
	"net/http"
	"strings"
	"time"

	"backend/internal/domain"
	"backend/internal/utils"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type SupplierService struct {
	db *gorm.DB
}

func NewSupplierService(db *gorm.DB) *SupplierService {
	return &SupplierService{db: db}
}

type SupplierInput struct {
	Name        string `json:"name"`
	Phone       string `json:"phone"`
	Email       string `json:"email"`
	Address     string `json:"address"`
	ContactName string `json:"contact_name"`
	Notes       string `json:"notes"`
	IsActive    *bool  `json:"is_active"`
}

func (s *SupplierService) List() ([]domain.Supplier, error) {
	rows, _, err := s.ListPaged(0, 0)
	return rows, err
}

func (s *SupplierService) ListPaged(limit, offset int) ([]domain.Supplier, int64, error) {
	var total int64
	var rows []domain.Supplier
	if err := s.db.Model(&domain.Supplier{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	q := s.db.Order("name asc")
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

func (s *SupplierService) GetByID(id uuid.UUID) (*domain.Supplier, error) {
	var row domain.Supplier
	if err := s.db.First(&row, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *SupplierService) Create(in SupplierInput) (*domain.Supplier, error) {
	if strings.TrimSpace(in.Name) == "" {
		return nil, utils.NewAppError(http.StatusBadRequest, "supplier name is required")
	}
	row := &domain.Supplier{
		Name:        strings.TrimSpace(in.Name),
		Phone:       strings.TrimSpace(in.Phone),
		Email:       strings.TrimSpace(in.Email),
		Address:     strings.TrimSpace(in.Address),
		ContactName: strings.TrimSpace(in.ContactName),
		Notes:       in.Notes,
		IsActive:    true,
	}
	if in.IsActive != nil {
		row.IsActive = *in.IsActive
	}
	if err := s.db.Create(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func (s *SupplierService) Update(id uuid.UUID, in SupplierInput) error {
	updates := map[string]any{
		"phone":        strings.TrimSpace(in.Phone),
		"email":        strings.TrimSpace(in.Email),
		"address":      strings.TrimSpace(in.Address),
		"contact_name": strings.TrimSpace(in.ContactName),
		"notes":        in.Notes,
	}
	if strings.TrimSpace(in.Name) != "" {
		updates["name"] = strings.TrimSpace(in.Name)
	}
	if in.IsActive != nil {
		updates["is_active"] = *in.IsActive
	}
	return s.db.Model(&domain.Supplier{}).Where("id = ?", id).Updates(updates).Error
}

func (s *SupplierService) Delete(id uuid.UUID) error {
	var purchaseRefs int64
	if err := s.db.Model(&domain.Purchase{}).Where("supplier_id = ?", id).Count(&purchaseRefs).Error; err != nil {
		return err
	}
	if purchaseRefs > 0 {
		// Soft-retire so purchase history stays readable.
		return s.db.Model(&domain.Supplier{}).Where("id = ?", id).
			Update("is_active", false).Error
	}
	return s.db.Where("id = ?", id).Delete(&domain.Supplier{}).Error
}

// ---------------------------------------------------------------------------

type ExpenseService struct {
	db *gorm.DB
}

func NewExpenseService(db *gorm.DB) *ExpenseService {
	return &ExpenseService{db: db}
}

type ExpenseInput struct {
	Category      string    `json:"category"`
	Title         string    `json:"title"`
	Amount        int       `json:"amount"`
	ExpenseDate   time.Time `json:"expense_date"`
	PaymentMethod string    `json:"payment_method"`
	Notes         string    `json:"notes"`
	ReceiptImage  string    `json:"receipt_image"`
	Recurrence    string    `json:"recurrence"`
}

func (s *ExpenseService) Categories() []string {
	return domain.DefaultExpenseCategories
}

func (s *ExpenseService) List(start, end *time.Time) ([]domain.Expense, error) {
	rows, _, err := s.ListPaged(start, end, 0, 0)
	return rows, err
}

func (s *ExpenseService) ListPaged(start, end *time.Time, limit, offset int) ([]domain.Expense, int64, error) {
	var total int64
	var rows []domain.Expense
	countQ := s.db.Model(&domain.Expense{})
	q := s.db.Order("expense_date desc, created_at desc")
	if start != nil {
		countQ = countQ.Where("expense_date >= ?", *start)
		q = q.Where("expense_date >= ?", *start)
	}
	if end != nil {
		countQ = countQ.Where("expense_date < ?", *end)
		q = q.Where("expense_date < ?", *end)
	}
	if err := countQ.Count(&total).Error; err != nil {
		return nil, 0, err
	}
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

func (s *ExpenseService) GetByID(id uuid.UUID) (*domain.Expense, error) {
	var row domain.Expense
	if err := s.db.First(&row, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *ExpenseService) Create(in ExpenseInput) (*domain.Expense, error) {
	if strings.TrimSpace(in.Category) == "" {
		return nil, utils.NewAppError(http.StatusBadRequest, "expense category is required")
	}
	if in.Amount <= 0 {
		return nil, utils.NewAppError(http.StatusBadRequest, "expense amount must be greater than zero")
	}
	if in.ExpenseDate.IsZero() {
		in.ExpenseDate = time.Now()
	}
	if strings.TrimSpace(in.PaymentMethod) == "" {
		in.PaymentMethod = "cash"
	}
	recurrence := strings.ToUpper(strings.TrimSpace(in.Recurrence))
	if recurrence == "" {
		recurrence = domain.RecurrenceNone
	}
	row := &domain.Expense{
		Category:      strings.TrimSpace(in.Category),
		Title:         strings.TrimSpace(in.Title),
		Amount:        in.Amount,
		ExpenseDate:   in.ExpenseDate,
		PaymentMethod: in.PaymentMethod,
		Notes:         in.Notes,
		ReceiptImage:  in.ReceiptImage,
		Recurrence:    recurrence,
	}
	if err := s.db.Create(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func (s *ExpenseService) Update(id uuid.UUID, in ExpenseInput) error {
	updates := map[string]any{
		"notes":          in.Notes,
		"receipt_image":  in.ReceiptImage,
		"payment_method": in.PaymentMethod,
	}
	if strings.TrimSpace(in.Category) != "" {
		updates["category"] = strings.TrimSpace(in.Category)
	}
	if strings.TrimSpace(in.Title) != "" {
		updates["title"] = strings.TrimSpace(in.Title)
	}
	if in.Amount > 0 {
		updates["amount"] = in.Amount
	}
	if !in.ExpenseDate.IsZero() {
		updates["expense_date"] = in.ExpenseDate
	}
	if strings.TrimSpace(in.Recurrence) != "" {
		updates["recurrence"] = strings.ToUpper(strings.TrimSpace(in.Recurrence))
	}
	return s.db.Model(&domain.Expense{}).Where("id = ?", id).Updates(updates).Error
}

func (s *ExpenseService) Delete(id uuid.UUID) error {
	return s.db.Where("id = ?", id).Delete(&domain.Expense{}).Error
}

func (s *ExpenseService) TotalBetween(start, end time.Time) (int, error) {
	var rows []domain.Expense
	// Include rows that started before the window — recurring bills still apply.
	if err := s.db.Where("expense_date < ?", end).Find(&rows).Error; err != nil {
		return 0, err
	}
	return SumAllocatedExpenses(rows, start, end), nil
}

// ListForAllocation returns expense rows that may affect [start, end).
func (s *ExpenseService) ListForAllocation(start, end time.Time) ([]domain.Expense, error) {
	var rows []domain.Expense
	err := s.db.Where("expense_date < ?", end).Order("expense_date asc").Find(&rows).Error
	_ = start // window start used by AllocateExpense, not the SQL filter
	return rows, err
}
