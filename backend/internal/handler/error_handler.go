package handler

import (
	"errors"
	"net/http"

	"backend/internal/logger"
	"backend/internal/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func HandleError(c *gin.Context, err error) {
	if err == nil {
		return
	}

	var appErr *utils.AppError
	if errors.As(err, &appErr) {
		utils.Error(c, appErr.Status, appErr.Message)
		return
	}

	if errors.Is(err, gorm.ErrRecordNotFound) {
		utils.Error(c, http.StatusNotFound, "resource not found")
		return
	}

	logger.Error("unhandled_error", map[string]any{
		"request_id": c.GetString("request_id"),
		"path":       c.Request.URL.Path,
		"error":      err.Error(),
	})
	utils.Error(c, http.StatusInternalServerError, "internal server error")
}
