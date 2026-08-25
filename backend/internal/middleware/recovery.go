package middleware

import (
	"net/http"

	"backend/internal/logger"
	"backend/internal/utils"

	"github.com/gin-gonic/gin"
)

func ErrorRecovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if recovered := recover(); recovered != nil {
				logger.Error("panic_recovered", map[string]any{
					"request_id": c.GetString("request_id"),
					"path":       c.Request.URL.Path,
					"panic":      recovered,
				})
				utils.Error(c, http.StatusInternalServerError, "internal server error")
				c.Abort()
			}
		}()
		c.Next()
	}
}
