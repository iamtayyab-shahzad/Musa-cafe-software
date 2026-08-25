package service

import (
	"log"
	"net/http"
	"strings"
	"time"

	"backend/internal/domain"
	"backend/internal/dto"
	"backend/internal/notify"
	"backend/internal/repository"
	"backend/internal/shop"
	"backend/internal/utils"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AuthService struct {
	repo      *repository.AuthRepository
	jwtSecret string
}

func NewAuthService(db *gorm.DB, jwtSecret string) *AuthService {
	return &AuthService{
		repo:      repository.NewAuthRepository(db),
		jwtSecret: jwtSecret,
	}
}

func (s *AuthService) StaffLogin(input dto.StaffLoginRequest) (string, error) {
	user, err := s.repo.GetStaffByUsername(input.Username)
	if err != nil {
		return "", utils.NewAppError(http.StatusUnauthorized, "invalid credentials")
	}
	if !utils.CheckPassword(user.Password, input.Password) {
		return "", utils.NewAppError(http.StatusUnauthorized, "invalid credentials")
	}
	return utils.GenerateToken(s.jwtSecret, user.ID.String(), "staff", 24*time.Hour)
}

func (s *AuthService) RegisterCustomer(input dto.CustomerRegisterRequest) (*domain.Customer, string, error) {
	hashed, err := utils.HashPassword(input.Password)
	if err != nil {
		return nil, "", err
	}

	tx := s.repo.DB().Begin()
	if tx.Error != nil {
		return nil, "", tx.Error
	}

	user := &domain.User{
		Name:     input.Name,
		Username: input.Phone,
		Password: hashed,
		Role:     "customer",
	}
	if err := s.repo.CreateUser(tx, user); err != nil {
		tx.Rollback()
		return nil, "", utils.NewAppError(http.StatusConflict, "phone already registered")
	}

	customer := &domain.Customer{
		Name:  input.Name,
		Phone: input.Phone,
	}
	if err := s.repo.CreateCustomer(tx, customer); err != nil {
		tx.Rollback()
		return nil, "", utils.NewAppError(http.StatusConflict, "phone already registered")
	}

	if err := tx.Commit().Error; err != nil {
		return nil, "", err
	}

	token, err := utils.GenerateToken(s.jwtSecret, customer.ID.String(), "customer", 7*24*time.Hour)
	if err != nil {
		return nil, "", err
	}
	return customer, token, nil
}

func (s *AuthService) CustomerLogin(input dto.CustomerLoginRequest) (*domain.Customer, string, error) {
	customer, err := s.repo.GetCustomerByPhone(input.Phone)
	if err != nil {
		return nil, "", utils.NewAppError(http.StatusUnauthorized, "invalid credentials")
	}
	user, err := s.repo.GetUserByUsername(input.Phone)
	if err != nil || user.Role != "customer" {
		return nil, "", utils.NewAppError(http.StatusUnauthorized, "invalid credentials")
	}
	if !utils.CheckPassword(user.Password, input.Password) {
		return nil, "", utils.NewAppError(http.StatusUnauthorized, "invalid credentials")
	}
	token, err := utils.GenerateToken(s.jwtSecret, customer.ID.String(), "customer", 7*24*time.Hour)
	if err != nil {
		return nil, "", err
	}
	return customer, token, nil
}

func (s *AuthService) GetCustomer(id string) (*domain.Customer, error) {
	customer, err := s.repo.GetCustomerByID(id)
	if err != nil {
		return nil, utils.NewAppError(http.StatusNotFound, "customer not found")
	}
	return customer, nil
}

func (s *AuthService) UpdateCustomerProfile(id string, input dto.UpdateCustomerProfileRequest) (*domain.Customer, error) {
	updates := map[string]any{}
	if input.Name != nil {
		updates["name"] = *input.Name
	}
	if input.DefaultAddress != nil {
		updates["default_address"] = *input.DefaultAddress
	}
	if input.DefaultLocationID != nil {
		updates["default_location_id"] = *input.DefaultLocationID
	}
	if len(updates) == 0 {
		return s.GetCustomer(id)
	}
	customer, err := s.repo.UpdateCustomer(id, updates)
	if err != nil {
		return nil, err
	}
	return customer, nil
}

func siteBaseURL() string {
	return strings.TrimRight(shop.Current().SiteURL, "/")
}

const passwordResetTTL = time.Hour

func (s *AuthService) HandleWhatsAppPasswordReset(senderPhone string) error {
	log.Printf("whatsapp reset: lookup start sender=%q variants=%v",
		senderPhone, utils.PhoneLookupVariants(senderPhone))

	registerURL := siteBaseURL() + "/register"
	resetBase := siteBaseURL() + "/reset?token="

	customer, err := s.repo.GetCustomerByPhoneVariants(senderPhone)
	if err != nil {
		log.Printf("whatsapp reset: customer NOT FOUND for %q: %v", senderPhone, err)
		reply := "We couldn't find an account with this WhatsApp number. Please register at " + registerURL
		if sendErr := notify.SendWhatsAppText(senderPhone, reply); sendErr != nil {
			log.Printf("whatsapp reset: send not-found reply FAILED to %q: %v", senderPhone, sendErr)
			return sendErr
		}
		log.Printf("whatsapp reset: send not-found reply OK to %q", senderPhone)
		return nil
	}
	log.Printf("whatsapp reset: customer FOUND id=%s phone=%q", customer.ID, customer.Phone)

	user, err := s.repo.GetUserByUsername(customer.Phone)
	if err != nil || user.Role != "customer" {
		role := ""
		if user != nil {
			role = user.Role
		}
		log.Printf("whatsapp reset: user NOT FOUND or wrong role phone=%q err=%v role=%q",
			customer.Phone, err, role)
		reply := "We couldn't find an account with this WhatsApp number. Please register at " + registerURL
		if sendErr := notify.SendWhatsAppText(senderPhone, reply); sendErr != nil {
			log.Printf("whatsapp reset: send not-found reply FAILED to %q: %v", senderPhone, sendErr)
			return sendErr
		}
		log.Printf("whatsapp reset: send not-found reply OK to %q", senderPhone)
		return nil
	}
	log.Printf("whatsapp reset: user FOUND id=%s username=%q", user.ID, user.Username)

	token, err := s.createPasswordReset(user.ID)
	if err != nil {
		log.Printf("whatsapp reset: create token FAILED for user %s: %v", user.ID, err)
		return err
	}
	log.Printf("whatsapp reset: token created for user %s", user.ID)

	link := resetBase + token
	reply := "Reset your " + shop.Current().Name + " password here (link expires in 1 hour):\n" + link
	if sendErr := notify.SendWhatsAppText(senderPhone, reply); sendErr != nil {
		log.Printf("whatsapp reset: send reset link FAILED to %q: %v", senderPhone, sendErr)
		return sendErr
	}
	log.Printf("whatsapp reset: send reset link OK to %q", senderPhone)
	return nil
}

func (s *AuthService) ResetPassword(input dto.CustomerResetPasswordRequest) error {
	tokenHash := utils.HashToken(input.Token)
	reset, err := s.repo.GetValidPasswordReset(tokenHash, time.Now())
	if err != nil {
		return utils.NewAppError(http.StatusBadRequest, "invalid or expired reset link")
	}

	hashed, err := utils.HashPassword(input.Password)
	if err != nil {
		return err
	}

	tx := s.repo.DB().Begin()
	if tx.Error != nil {
		return tx.Error
	}
	if err := s.repo.UpdateUserPassword(tx, reset.UserID.String(), hashed); err != nil {
		tx.Rollback()
		return err
	}
	if err := s.repo.MarkPasswordResetUsed(tx, reset.ID.String(), time.Now()); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit().Error
}

func (s *AuthService) createPasswordReset(userID uuid.UUID) (string, error) {
	token, err := utils.GenerateSecureToken(32)
	if err != nil {
		return "", err
	}
	reset := &domain.PasswordReset{
		UserID:    userID,
		TokenHash: utils.HashToken(token),
		ExpiresAt: time.Now().Add(passwordResetTTL),
	}
	if err := s.repo.CreatePasswordReset(reset); err != nil {
		return "", err
	}
	return token, nil
}
