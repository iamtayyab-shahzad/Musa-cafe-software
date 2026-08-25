package handler

import (
	"net/http"
	"strconv"

	"backend/internal/domain"
	"backend/internal/dto"
	"backend/internal/service"
	"backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type CustomerHandler struct {
	auth   *service.AuthService
	orders *service.OrderService
}

func NewCustomerHandler(auth *service.AuthService, orders *service.OrderService) *CustomerHandler {
	return &CustomerHandler{auth: auth, orders: orders}
}

func customerIDFromContext(c *gin.Context) (string, error) {
	raw, ok := c.Get("user_id")
	if !ok {
		return "", utils.NewAppError(http.StatusUnauthorized, "unauthorized")
	}
	id, ok := raw.(string)
	if !ok || id == "" {
		return "", utils.NewAppError(http.StatusUnauthorized, "unauthorized")
	}
	if _, err := uuid.Parse(id); err != nil {
		return "", utils.NewAppError(http.StatusUnauthorized, "invalid customer token")
	}
	return id, nil
}

// GetMe returns the logged-in customer profile.
func (h *CustomerHandler) GetMe(c *gin.Context) {
	id, err := customerIDFromContext(c)
	if err != nil {
		HandleError(c, err)
		return
	}
	customer, err := h.auth.GetCustomer(id)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "ok", customer)
}

// UpdateMe updates autofill fields (name, default address, area).
func (h *CustomerHandler) UpdateMe(c *gin.Context) {
	id, err := customerIDFromContext(c)
	if err != nil {
		HandleError(c, err)
		return
	}
	var input dto.UpdateCustomerProfileRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	customer, err := h.auth.UpdateCustomerProfile(id, input)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "profile updated", customer)
}

// ListMyOrders returns up to 5 newest orders for reorder / recent history.
func (h *CustomerHandler) ListMyOrders(c *gin.Context) {
	id, err := customerIDFromContext(c)
	if err != nil {
		HandleError(c, err)
		return
	}
	limit := 5
	if raw := c.Query("limit"); raw != "" {
		if n, parseErr := strconv.Atoi(raw); parseErr == nil && n > 0 {
			limit = n
		}
	}
	customerUUID, _ := uuid.Parse(id)
	orders, err := h.orders.ListCustomerOrders(customerUUID, limit)
	if err != nil {
		HandleError(c, err)
		return
	}
	if orders == nil {
		orders = []domain.Order{}
	}
	utils.Success(c, http.StatusOK, "ok", orders)
}
