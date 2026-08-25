package handler

import (
	"net/http"
	"strconv"
	"strings"

	"backend/internal/service"
	"backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type InventoryTransactionHandler struct {
	service *service.InventoryTransactionService
}

func NewInventoryTransactionHandler(service *service.InventoryTransactionService) *InventoryTransactionHandler {
	return &InventoryTransactionHandler{service: service}
}

// List transactions for a specific inventory item (optional inventory_id),
// used for the Admin "Stock History" view.
func (h *InventoryTransactionHandler) List(c *gin.Context) {
	var inventoryID *uuid.UUID
	raw := strings.TrimSpace(c.Query("inventory_id"))
	if raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			utils.Error(c, http.StatusBadRequest, "invalid inventory_id")
			return
		}
		inventoryID = &id
	}
	movementType := strings.TrimSpace(c.Query("type"))
	limit := 100
	if rawLimit := strings.TrimSpace(c.Query("limit")); rawLimit != "" {
		if n, err := strconv.Atoi(rawLimit); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > 500 {
		limit = 500
	}

	data, err := h.service.ListTransactions(inventoryID, movementType, limit)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "inventory transactions", data)
}
