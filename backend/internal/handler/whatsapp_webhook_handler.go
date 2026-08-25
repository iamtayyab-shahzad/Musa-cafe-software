package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"backend/internal/service"

	"github.com/gin-gonic/gin"
)

type WhatsAppWebhookHandler struct {
	auth *service.AuthService
}

func NewWhatsAppWebhookHandler(auth *service.AuthService) *WhatsAppWebhookHandler {
	return &WhatsAppWebhookHandler{auth: auth}
}

// Verify handles Meta webhook subscription verification (GET).
func (h *WhatsAppWebhookHandler) Verify(c *gin.Context) {
	mode := c.Query("hub.mode")
	token := c.Query("hub.verify_token")
	challenge := c.Query("hub.challenge")

	expected := strings.TrimSpace(os.Getenv("WHATSAPP_VERIFY_TOKEN"))
	if mode == "subscribe" && expected != "" && token == expected {
		c.String(http.StatusOK, challenge)
		return
	}
	c.String(http.StatusForbidden, "")
}

type whatsAppWebhookPayload struct {
	Entry []struct {
		Changes []struct {
			Value struct {
				Messages []struct {
					From string `json:"from"`
					Text struct {
						Body string `json:"body"`
					} `json:"text"`
				} `json:"messages"`
			} `json:"value"`
		} `json:"changes"`
	} `json:"entry"`
}

// Receive handles incoming WhatsApp messages (POST). Always responds 200 so Meta does not retry.
func (h *WhatsAppWebhookHandler) Receive(c *gin.Context) {
	body, err := c.GetRawData()
	if err != nil {
		log.Printf("whatsapp webhook: read body error: %v", err)
		c.Status(http.StatusOK)
		return
	}
	log.Printf("whatsapp webhook: raw payload: %s", string(body))

	var payload whatsAppWebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		log.Printf("whatsapp webhook: json unmarshal error: %v", err)
		c.Status(http.StatusOK)
		return
	}

	from, text := extractWhatsAppMessage(payload)
	log.Printf("whatsapp webhook: extracted from=%q text=%q", from, text)

	if from == "" || text == "" {
		log.Printf("whatsapp webhook: no message in payload (status update or empty)")
		c.Status(http.StatusOK)
		return
	}

	normalized := strings.ToLower(strings.TrimSpace(text))
	if normalized != "reset" {
		log.Printf("whatsapp webhook: ignoring non-reset message: %q", normalized)
		c.Status(http.StatusOK)
		return
	}

	log.Printf("whatsapp webhook: RESET from %s, processing async", from)
	go func(phone string) {
		if err := h.auth.HandleWhatsAppPasswordReset(phone); err != nil {
			log.Printf("whatsapp webhook: password reset failed for %s: %v", phone, err)
		} else {
			log.Printf("whatsapp webhook: password reset completed for %s", phone)
		}
	}(from)

	c.Status(http.StatusOK)
}

func extractWhatsAppMessage(payload whatsAppWebhookPayload) (from, text string) {
	if len(payload.Entry) == 0 || len(payload.Entry[0].Changes) == 0 {
		return "", ""
	}
	messages := payload.Entry[0].Changes[0].Value.Messages
	if len(messages) == 0 {
		return "", ""
	}
	msg := messages[0]
	return strings.TrimSpace(msg.From), strings.TrimSpace(msg.Text.Body)
}
