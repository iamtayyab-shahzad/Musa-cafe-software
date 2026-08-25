package handler

import (
	"net/http"

	"backend/internal/service"
	"backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// CatalogHandler exposes cascade-aware delete endpoints for products and categories.
type CatalogHandler struct {
	service *service.CatalogService
}

func NewCatalogHandler(s *service.CatalogService) *CatalogHandler {
	return &CatalogHandler{service: s}
}

func (h *CatalogHandler) DeleteProductSize(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.service.DeleteProductSize(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "product size deleted", nil)
}

func (h *CatalogHandler) DeleteProduct(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.service.DeleteProduct(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "product deleted", nil)
}

func (h *CatalogHandler) DeleteCategory(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.service.DeleteCategory(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "category deleted", nil)
}

func (h *CatalogHandler) DeleteLocation(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.service.DeleteLocation(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "location deleted", nil)
}
