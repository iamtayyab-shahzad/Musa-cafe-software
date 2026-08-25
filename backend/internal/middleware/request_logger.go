package middleware

import (
	"time"

	"backend/internal/logger"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if id == "" {
			id = uuid.NewString()
		}
		c.Set("request_id", id)
		c.Writer.Header().Set("X-Request-ID", id)
		c.Next()
	}
}

func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		// Health probes are extremely frequent on Render — skip noisy logs.
		if path == "/health" || path == "/api/v1/health" {
			c.Next()
			return
		}
		start := time.Now()
		c.Next()
		status := c.Writer.Status()
		latency := time.Since(start).Milliseconds()
		// In production prefer logging slow/error responses to cut I/O.
		if status < 400 && latency < 800 {
			return
		}
		logger.Info("http_request", map[string]any{
			"request_id": c.GetString("request_id"),
			"method":     c.Request.Method,
			"path":       path,
			"status":     status,
			"latency_ms": latency,
			"client_ip":  c.ClientIP(),
		})
	}
}
