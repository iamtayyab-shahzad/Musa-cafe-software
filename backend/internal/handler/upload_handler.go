package handler

import (
	"context"
	"errors"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"backend/internal/cloudinary"
	"backend/internal/config"
	"backend/internal/utils"

	"github.com/gin-gonic/gin"
)

type UploadHandler struct {
	cloudinary config.CloudinaryConfig
	folder     string
}

func NewUploadHandler(cfg config.CloudinaryConfig, folder string) *UploadHandler {
	if strings.TrimSpace(folder) == "" {
		folder = "musacafe"
	}
	return &UploadHandler{cloudinary: cfg, folder: folder}
}

func (h *UploadHandler) Image(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "image file is required")
		return
	}
	src, err := file.Open()
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "could not read image file")
		return
	}
	defer src.Close()

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	url, err := cloudinary.UploadImage(ctx, h.cloudinary, h.folder, src, filepath.Base(file.Filename))
	if err != nil {
		switch {
		case errors.Is(err, cloudinary.ErrNotConfigured):
			utils.Error(c, http.StatusServiceUnavailable, "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET on the API.")
		case errors.Is(err, cloudinary.ErrEmptyFile):
			utils.Error(c, http.StatusBadRequest, "image file is empty")
		case errors.Is(err, cloudinary.ErrTooLarge):
			utils.Error(c, http.StatusRequestEntityTooLarge, "image is too large (max 2MB)")
		default:
			utils.Error(c, http.StatusBadGateway, err.Error())
		}
		return
	}
	utils.Success(c, http.StatusCreated, "uploaded", gin.H{"url": url})
}
