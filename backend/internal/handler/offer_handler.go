package handler

import (
	"net/http"

	"backend/internal/domain"
	"backend/internal/service"
	"backend/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type OfferHandler struct {
	service *service.OfferService
}

func NewOfferHandler(service *service.OfferService) *OfferHandler {
	return &OfferHandler{service: service}
}

func (h *OfferHandler) Register(r gin.IRoutes, path string) {
	r.GET(path, h.List)
	r.GET(path+"/:id", h.GetByID)
	r.POST(path, h.Create)
	r.PUT(path+"/:id", h.Update)
	r.DELETE(path+"/:id", h.Delete)
	r.PATCH(path+"/:id/enable", h.Enable)
	r.PATCH(path+"/:id/disable", h.Disable)
}

func (h *OfferHandler) Create(c *gin.Context) {
	var payload domain.Offer
	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.service.Create(&payload); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusCreated, "offer created", payload)
}

func (h *OfferHandler) List(c *gin.Context) {
	limit, offset, paged := parsePage(c)
	if !paged {
		data, err := h.service.List()
		if err != nil {
			HandleError(c, err)
			return
		}
		utils.Success(c, http.StatusOK, "offers list", data)
		return
	}
	items, total, err := h.service.ListPaged(limit, offset)
	if err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "offers list", pageResult(items, total, limit, offset))
}

func (h *OfferHandler) GetByID(c *gin.Context) {
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
	utils.Success(c, http.StatusOK, "offer details", data)
}

func (h *OfferHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	updates := map[string]any{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.service.Update(id, updates); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "offer updated", nil)
}

func (h *OfferHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.service.Delete(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "offer deleted", nil)
}

func (h *OfferHandler) Enable(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.service.Enable(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "offer enabled", nil)
}

func (h *OfferHandler) Disable(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.service.Disable(id); err != nil {
		HandleError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "offer disabled", nil)
}
