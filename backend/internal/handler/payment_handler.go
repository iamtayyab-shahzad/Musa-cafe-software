package handler

import (
	"net/http"

	"backend/internal/dto"
	"backend/internal/service"
	"backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type PaymentHandler struct {
	service *service.PaymentService
}

func NewPaymentHandler(service *service.PaymentService) *PaymentHandler {
	return &PaymentHandler{service: service}
}

func (h *PaymentHandler) Create(c *gin.Context) {
	var input dto.CreatePaymentRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	payment, err := h.service.Create(input)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusCreated, "payment created", payment)
}

func (h *PaymentHandler) List(c *gin.Context) {
	limit, offset, paged := parsePage(c)
	if !paged {
		payments, err := h.service.List()
		if err != nil {
			HandleError(c, err)
			return
		}
		utils.Success(c, http.StatusOK, "payments list", payments)
		return
	}
	items, total, err := h.service.ListPaged(limit, offset)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "payments list", pageResult(items, total, limit, offset))
}

func (h *PaymentHandler) GetByID(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	payment, err := h.service.GetByID(id)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "payment details", payment)
}

func (h *PaymentHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	var input dto.UpdatePaymentRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	payment, err := h.service.Update(id, input)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "payment updated", payment)
}

func (h *PaymentHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.service.Delete(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "payment deleted", nil)
}
