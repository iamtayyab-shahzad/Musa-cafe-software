package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestWhatsAppWebhookVerify(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("WHATSAPP_VERIFY_TOKEN", "secret-token")

	h := NewWhatsAppWebhookHandler(nil)

	t.Run("valid", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=secret-token&hub.challenge=12345", nil)
		h.Verify(c)
		if w.Code != http.StatusOK {
			t.Fatalf("status %d", w.Code)
		}
		if w.Body.String() != "12345" {
			t.Fatalf("body %q", w.Body.String())
		}
	})

	t.Run("invalid token", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345", nil)
		h.Verify(c)
		if w.Code != http.StatusForbidden {
			t.Fatalf("status %d", w.Code)
		}
	})
}

func TestExtractWhatsAppMessage(t *testing.T) {
	raw := `{
		"entry": [{
			"changes": [{
				"value": {
					"messages": [{
						"from": "923001234567",
						"text": { "body": " RESET " }
					}]
				}
			}]
		}]
	}`
	var payload whatsAppWebhookPayload
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatal(err)
	}
	from, text := extractWhatsAppMessage(payload)
	if from != "923001234567" || text != "RESET" {
		t.Fatalf("got %q %q", from, text)
	}
}
