package handler

import (
	"net/http"

	"backend/internal/service"
	"backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type PurchaseHandler struct {
	service *service.PurchaseService
}

func NewPurchaseHandler(s *service.PurchaseService) *PurchaseHandler {
	return &PurchaseHandler{service: s}
}

func (h *PurchaseHandler) List(c *gin.Context) {
	limit, offset, paged := parsePage(c)
	if !paged {
		data, err := h.service.List()
		if err != nil {
			HandleError(c, err)
			return
		}
		utils.Success(c, http.StatusOK, "purchase list", data)
		return
	}
	items, total, err := h.service.ListPaged(limit, offset)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "purchase list", pageResult(items, total, limit, offset))
}

func (h *PurchaseHandler) GetByID(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	data, err := h.service.GetByID(id)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "purchase details", data)
}

func (h *PurchaseHandler) Create(c *gin.Context) {
	var in service.PurchaseInput
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := h.service.Create(in)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusCreated, "purchase created", data)
}

func (h *PurchaseHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	var in service.PurchaseInput
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := h.service.Update(id, in)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "purchase updated", data)
}

func (h *PurchaseHandler) Reverse(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.service.Reverse(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "purchase reversed", nil)
}

// ---------------------------------------------------------------------------

type SupplierHandler struct {
	service *service.SupplierService
}

func NewSupplierHandler(s *service.SupplierService) *SupplierHandler {
	return &SupplierHandler{service: s}
}

func (h *SupplierHandler) List(c *gin.Context) {
	limit, offset, paged := parsePage(c)
	if !paged {
		data, err := h.service.List()
		if err != nil {
			HandleError(c, err)
			return
		}
		utils.Success(c, http.StatusOK, "supplier list", data)
		return
	}
	items, total, err := h.service.ListPaged(limit, offset)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "supplier list", pageResult(items, total, limit, offset))
}

func (h *SupplierHandler) GetByID(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	data, err := h.service.GetByID(id)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "supplier details", data)
}

func (h *SupplierHandler) Create(c *gin.Context) {
	var in service.SupplierInput
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := h.service.Create(in)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusCreated, "supplier created", data)
}

func (h *SupplierHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	var in service.SupplierInput
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.service.Update(id, in); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "supplier updated", nil)
}

func (h *SupplierHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.service.Delete(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "supplier deleted", nil)
}

// ---------------------------------------------------------------------------

type ExpenseHandler struct {
	service *service.ExpenseService
}

func NewExpenseHandler(s *service.ExpenseService) *ExpenseHandler {
	return &ExpenseHandler{service: s}
}

func (h *ExpenseHandler) Categories(c *gin.Context) {
	utils.Success(c, http.StatusOK, "expense categories", h.service.Categories())
}

func (h *ExpenseHandler) List(c *gin.Context) {
	limit, offset, paged := parsePage(c)
	if !paged {
		data, err := h.service.List(nil, nil)
		if err != nil {
			HandleError(c, err)
			return
		}
		utils.Success(c, http.StatusOK, "expense list", data)
		return
	}
	items, total, err := h.service.ListPaged(nil, nil, limit, offset)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "expense list", pageResult(items, total, limit, offset))
}

func (h *ExpenseHandler) GetByID(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	data, err := h.service.GetByID(id)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "expense details", data)
}

func (h *ExpenseHandler) Create(c *gin.Context) {
	var in service.ExpenseInput
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := h.service.Create(in)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusCreated, "expense created", data)
}

func (h *ExpenseHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	var in service.ExpenseInput
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.service.Update(id, in); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "expense updated", nil)
}

func (h *ExpenseHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.service.Delete(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "expense deleted", nil)
}

// ---------------------------------------------------------------------------

type RecipeHandler struct {
	service *service.RecipeService
}

func NewRecipeHandler(s *service.RecipeService) *RecipeHandler {
	return &RecipeHandler{service: s}
}

func (h *RecipeHandler) List(c *gin.Context) {
	limit, offset, paged := parsePage(c)
	if !paged {
		data, err := h.service.List()
		if err != nil {
			HandleError(c, err)
			return
		}
		utils.Success(c, http.StatusOK, "recipe list", data)
		return
	}
	items, total, err := h.service.ListPaged(limit, offset)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "recipe list", pageResult(items, total, limit, offset))
}

func (h *RecipeHandler) ListByProduct(c *gin.Context) {
	id, err := uuid.Parse(c.Param("productId"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid product id")
		return
	}
	data, err := h.service.ListByProduct(id)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "product recipes", data)
}

func (h *RecipeHandler) Create(c *gin.Context) {
	var payload struct {
		ProductID        uuid.UUID  `json:"product_id"`
		ProductSizeID    *uuid.UUID `json:"product_size_id"`
		InventoryID      uuid.UUID  `json:"inventory_id"`
		QuantityRequired int64      `json:"quantity_required"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := h.service.Create(service.RecipeLineInput{
		InventoryID:      payload.InventoryID,
		QuantityRequired: payload.QuantityRequired,
		ProductSizeID:    payload.ProductSizeID,
	}, payload.ProductID)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusCreated, "recipe created", data)
}

func (h *RecipeHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	var line service.RecipeLineInput
	if err := c.ShouldBindJSON(&line); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.service.Update(id, line); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "recipe updated", nil)
}

func (h *RecipeHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.service.Delete(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "recipe deleted", nil)
}

func (h *RecipeHandler) ReplaceSet(c *gin.Context) {
	var in service.RecipeSetInput
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := h.service.ReplaceSet(in)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "recipe set saved", data)
}

// ---------------------------------------------------------------------------

type ReportHandler struct {
	service *service.ReportService
}

func NewReportHandler(s *service.ReportService) *ReportHandler {
	return &ReportHandler{service: s}
}

func (h *ReportHandler) ProfitLoss(c *gin.Context) {
	start, end, err := parseDateRange(c)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := h.service.ProfitLossBetween(start, end)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "profit and loss", data)
}
