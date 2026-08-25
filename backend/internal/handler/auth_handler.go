package handler

import (
	"errors"
	"net/http"

	"backend/internal/dto"
	"backend/internal/middleware"
	"backend/internal/service"
	"backend/internal/utils"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	service    *service.AuthService
	loginLimit *middleware.LoginRateLimiter
}

func NewAuthHandler(service *service.AuthService) *AuthHandler {
	return &AuthHandler{
		service:    service,
		loginLimit: middleware.NewLoginRateLimiter(),
	}
}

// StaffLogin godoc
// @Summary Staff login
// @Tags auth
// @Accept json
// @Produce json
// @Param body body dto.StaffLoginRequest true "credentials"
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/auth/staff/login [post]
func (h *AuthHandler) StaffLogin(c *gin.Context) {
	var input dto.StaffLoginRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	ip := middleware.ClientIP(c)
	account := middleware.AccountFromStaff(input.Username)
	if err := h.loginLimit.Check(ip, account); err != nil {
		HandleError(c, err)
		return
	}
	token, err := h.service.StaffLogin(input)
	if err != nil {
		if isUnauthorized(err) {
			h.loginLimit.RecordFailure(ip, account)
		}
		HandleError(c, err)
		return
	}
	h.loginLimit.RecordSuccess(ip, account)
	utils.Success(c, http.StatusOK, "staff login successful", gin.H{"token": token})
}

// CustomerRegister godoc
// @Summary Customer registration
// @Tags auth
// @Accept json
// @Produce json
// @Param body body dto.CustomerRegisterRequest true "registration"
// @Success 201 {object} map[string]interface{}
// @Router /api/v1/auth/customers/register [post]
func (h *AuthHandler) CustomerRegister(c *gin.Context) {
	var input dto.CustomerRegisterRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	customer, token, err := h.service.RegisterCustomer(input)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusCreated, "customer registered", gin.H{"customer": customer, "token": token})
}

// CustomerLogin godoc
// @Summary Customer login
// @Tags auth
// @Accept json
// @Produce json
// @Param body body dto.CustomerLoginRequest true "credentials"
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/auth/customers/login [post]
func (h *AuthHandler) CustomerLogin(c *gin.Context) {
	var input dto.CustomerLoginRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	ip := middleware.ClientIP(c)
	account := middleware.AccountFromCustomer(input.Phone)
	if err := h.loginLimit.Check(ip, account); err != nil {
		HandleError(c, err)
		return
	}
	customer, token, err := h.service.CustomerLogin(input)
	if err != nil {
		if isUnauthorized(err) {
			h.loginLimit.RecordFailure(ip, account)
		}
		HandleError(c, err)
		return
	}
	h.loginLimit.RecordSuccess(ip, account)
	utils.Success(c, http.StatusOK, "customer login successful", gin.H{
		"customer": customer,
		"token":    token,
	})
}

// CustomerResetPassword godoc
// @Summary Reset customer password with WhatsApp token
// @Tags auth
// @Accept json
// @Produce json
// @Param body body dto.CustomerResetPasswordRequest true "reset"
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/auth/customers/reset-password [post]
func (h *AuthHandler) CustomerResetPassword(c *gin.Context) {
	var input dto.CustomerResetPasswordRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.service.ResetPassword(input); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "password updated", nil)
}

func isUnauthorized(err error) bool {
	var appErr *utils.AppError
	if errors.As(err, &appErr) {
		return appErr.Status == http.StatusUnauthorized
	}
	return false
}
