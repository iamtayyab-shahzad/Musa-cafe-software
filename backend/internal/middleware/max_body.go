package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// DefaultMaxBodyBytes caps JSON/API payloads so huge base64 images cannot
// exhaust memory. ~2MB allows a compressed ~400KB data-URL plus normal fields.
const DefaultMaxBodyBytes int64 = 2 * 1024 * 1024

// MaxBodyBytes wraps the request body with http.MaxBytesReader and rejects
// oversized Content-Length early with 413.
func MaxBodyBytes(n int64) gin.HandlerFunc {
	if n <= 0 {
		n = DefaultMaxBodyBytes
	}
	return func(c *gin.Context) {
		if c.Request.ContentLength > n {
			c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{
				"error": "request body too large (max 2MB)",
			})
			return
		}
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, n)
		}
		c.Next()
	}
}
