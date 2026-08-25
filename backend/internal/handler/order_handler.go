package handler

import (
	"net/http"
	"strconv"
	"strings"

	"backend/internal/dto"
	"backend/internal/repository"
	"backend/internal/service"
	"backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
)

type OrderHandler struct {
	service *service.OrderService
}

func NewOrderHandler(service *service.OrderService) *OrderHandler {
	return &OrderHandler{service: service}
}

func (h *OrderHandler) createWithType(c *gin.Context, orderType string) {
	var input dto.CreateOrderRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.Error(c, http.StatusBadRequest, orderValidationMessage(err))
		return
	}
	if input.IsGuest && orderType == "website" {
		orderType = "guest"
	}

	var customerID *uuid.UUID
	userType, _ := c.Get("user_type")
	if rawID, exists := c.Get("user_id"); exists && userType == "customer" {
		parsed, err := uuid.Parse(rawID.(string))
		if err != nil {
			utils.Error(c, http.StatusUnauthorized, "invalid customer token")
			return
		}
		customerID = &parsed
	}

	order, err := h.service.CreateOrder(input, orderType, customerID)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusCreated, "order created", order)
}

func orderValidationMessage(err error) string {
	msg := err.Error()
	if strings.Contains(strings.ToLower(msg), "uuid") {
		return "your cart has outdated items — clear the cart and add products again"
	}

	validationErrors, ok := err.(validator.ValidationErrors)
	if !ok || len(validationErrors) == 0 {
		return "invalid order request"
	}

	switch validationErrors[0].Field() {
	case "CustomerName":
		return "customer name is required"
	case "Phone":
		return "valid phone number is required"
	case "Address":
		return "delivery address is too long"
	case "LocationID":
		return "delivery location is required"
	case "PaymentMethod":
		return "valid payment method is required"
	case "Items":
		return "cart cannot be empty"
	case "ProductID":
		return "order item product is required"
	case "ProductSizeID":
		return "order item size is required"
	case "Quantity":
		return "order item quantity must be at least 1"
	default:
		return "invalid order request"
	}
}

// Create godoc
// @Summary Create website/guest order
// @Tags orders
// @Accept json
// @Produce json
// @Param body body dto.CreateOrderRequest true "order"
// @Success 201 {object} map[string]interface{}
// @Router /api/v1/orders [post]
func (h *OrderHandler) Create(c *gin.Context) {
	h.createWithType(c, "website")
}

func (h *OrderHandler) CreatePhone(c *gin.Context) {
	h.createWithType(c, "phone")
}

func (h *OrderHandler) CreateWalkin(c *gin.Context) {
	h.createWithType(c, "walkin")
}

func (h *OrderHandler) List(c *gin.Context) {
	limit := 50
	offset := 0

	if rawLimit := strings.TrimSpace(c.Query("limit")); rawLimit != "" {
		if v, err := strconv.Atoi(rawLimit); err == nil {
			limit = v
		}
	}
	if rawOffset := strings.TrimSpace(c.Query("offset")); rawOffset != "" {
		if v, err := strconv.Atoi(rawOffset); err == nil {
			offset = v
		}
	}

	// Clamp to keep responses bounded even if the client sends bad values.
	if limit < 1 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}

	since, err := parseSinceQuery(c)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid since (use RFC3339)")
		return
	}
	createdFrom, createdTo, err := parseOptionalCreatedRange(c)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	orders, total, err := h.service.ListOrders(repository.OrderListFilter{
		Limit:       limit,
		Offset:      offset,
		Since:       since,
		CreatedFrom: createdFrom,
		CreatedTo:   createdTo,
		Status:      strings.TrimSpace(c.Query("status")),
		Query:       strings.TrimSpace(c.Query("q")),
	})
	if err != nil {
		HandleError(c, err)
		return
	}
	// POS and older clients expect a bare array. Admin passes include_total=1
	// for paginated { items, total, limit, offset }.
	if strings.TrimSpace(c.Query("include_total")) == "1" {
		utils.Success(c, http.StatusOK, "orders list", pageResult(orders, total, limit, offset))
		return
	}
	utils.Success(c, http.StatusOK, "orders list", orders)
}

func (h *OrderHandler) ListPending(c *gin.Context) {
	orders, err := h.service.ListPendingOrders()
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "pending orders", orders)
}

func (h *OrderHandler) ListPhone(c *gin.Context) {
	orders, err := h.service.ListOrdersByType("phone")
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "phone orders", orders)
}

func (h *OrderHandler) ListWalkin(c *gin.Context) {
	orders, err := h.service.ListOrdersByType("walkin")
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "walk-in orders", orders)
}

func (h *OrderHandler) LookupCustomers(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		utils.Success(c, http.StatusOK, "customer lookup", []any{})
		return
	}
	rows, err := h.service.LookupCustomersByPhone(q)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "customer lookup", rows)
}

func (h *OrderHandler) GetByID(c *gin.Context) {
	id, err := service.ParseOrderID(c.Param("id"))
	if err != nil {
		HandleError(c, err)
		return
	}
	order, err := h.service.GetOrderByID(id)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "order details", order)
}

func (h *OrderHandler) Update(c *gin.Context) {
	id, err := service.ParseOrderID(c.Param("id"))
	if err != nil {
		HandleError(c, err)
		return
	}
	var input dto.UpdateOrderRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.service.UpdateOrder(id, input); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "order updated", nil)
}

func (h *OrderHandler) Delete(c *gin.Context) {
	id, err := service.ParseOrderID(c.Param("id"))
	if err != nil {
		HandleError(c, err)
		return
	}
	if err := h.service.DeleteOrder(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "order deleted", nil)
}

func (h *OrderHandler) Cancel(c *gin.Context) {
	id, err := service.ParseOrderID(c.Param("id"))
	if err != nil {
		HandleError(c, err)
		return
	}
	if err := h.service.CancelOrder(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "order cancelled", nil)
}

func (h *OrderHandler) Complete(c *gin.Context) {
	id, err := service.ParseOrderID(c.Param("id"))
	if err != nil {
		HandleError(c, err)
		return
	}
	if err := h.service.CompleteOrder(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "order completed", nil)
}
