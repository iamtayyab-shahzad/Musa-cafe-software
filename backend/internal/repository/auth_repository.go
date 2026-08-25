package repository

import (
	"time"

	"backend/internal/domain"
	"backend/internal/utils"

	"gorm.io/gorm"
)

type AuthRepository struct {
	db *gorm.DB
}

func NewAuthRepository(db *gorm.DB) *AuthRepository {
	return &AuthRepository{db: db}
}

func (r *AuthRepository) GetStaffByUsername(username string) (*domain.User, error) {
	var user domain.User
	// Accept legacy rows with empty role while enforcing staff for new accounts.
	if err := r.db.
		Where("username = ? AND (role = ? OR role = '' OR role IS NULL)", username, "staff").
		First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *AuthRepository) GetCustomerByPhone(phone string) (*domain.Customer, error) {
	var customer domain.Customer
	if err := r.db.Where("phone = ?", phone).First(&customer).Error; err != nil {
		return nil, err
	}
	return &customer, nil
}

// GetCustomerByPhoneVariants finds a customer using local (03…) or international (92…) forms.
func (r *AuthRepository) GetCustomerByPhoneVariants(raw string) (*domain.Customer, error) {
	for _, candidate := range utils.PhoneLookupVariants(raw) {
		customer, err := r.GetCustomerByPhone(candidate)
		if err == nil {
			return customer, nil
		}
		if err != gorm.ErrRecordNotFound {
			return nil, err
		}
	}
	return nil, gorm.ErrRecordNotFound
}

func (r *AuthRepository) GetUserByUsername(username string) (*domain.User, error) {
	var user domain.User
	if err := r.db.Where("username = ?", username).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *AuthRepository) CreateUser(tx *gorm.DB, user *domain.User) error {
	return tx.Create(user).Error
}

func (r *AuthRepository) CreateCustomer(tx *gorm.DB, customer *domain.Customer) error {
	return tx.Create(customer).Error
}

func (r *AuthRepository) GetCustomerByID(id string) (*domain.Customer, error) {
	var customer domain.Customer
	if err := r.db.Where("id = ?", id).First(&customer).Error; err != nil {
		return nil, err
	}
	return &customer, nil
}

func (r *AuthRepository) UpdateCustomer(id string, updates map[string]any) (*domain.Customer, error) {
	if len(updates) == 0 {
		return r.GetCustomerByID(id)
	}
	if err := r.db.Model(&domain.Customer{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return r.GetCustomerByID(id)
}

func (r *AuthRepository) DB() *gorm.DB {
	return r.db
}

func (r *AuthRepository) CreatePasswordReset(reset *domain.PasswordReset) error {
	return r.db.Create(reset).Error
}

func (r *AuthRepository) GetValidPasswordReset(tokenHash string, now time.Time) (*domain.PasswordReset, error) {
	var reset domain.PasswordReset
	err := r.db.
		Where("token_hash = ? AND expires_at > ? AND used_at IS NULL", tokenHash, now).
		First(&reset).Error
	if err != nil {
		return nil, err
	}
	return &reset, nil
}

func (r *AuthRepository) MarkPasswordResetUsed(tx *gorm.DB, id string, usedAt time.Time) error {
	return tx.Model(&domain.PasswordReset{}).
		Where("id = ?", id).
		Update("used_at", usedAt).Error
}

func (r *AuthRepository) UpdateUserPassword(tx *gorm.DB, userID, hashed string) error {
	return tx.Model(&domain.User{}).Where("id = ?", userID).Update("password", hashed).Error
}
