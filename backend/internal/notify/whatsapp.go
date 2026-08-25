package notify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"backend/internal/utils"

	"github.com/google/uuid"
)

const graphAPIBase = "https://graph.facebook.com/v21.0"

const websiteOrderTemplateName = "website_order_alert"
const websiteOrderTemplateLang = "en"

var missingEnvOnce sync.Once

// OrderAlert is the WhatsApp payload for a new website order.
type OrderAlert struct {
	OrderID       uuid.UUID
	OrderNumber   string
	CustomerName  string
	Phone         string
	Address       string
	LocationName  string
	PaymentMethod string
	OrderNotes    string
	Subtotal      int
	Discount      int
	Delivery      int
	CODFee        int
	GrandTotal    int
	Items         []OrderAlertItem
}

type OrderAlertItem struct {
	Name         string
	Size         string
	Quantity     int
	LineTotal    int
	Instructions string
}

type textMessagePayload struct {
	MessagingProduct string `json:"messaging_product"`
	To               string `json:"to"`
	Type             string `json:"type"`
	Text             struct {
		Body string `json:"body"`
	} `json:"text"`
}

type templateMessagePayload struct {
	MessagingProduct string               `json:"messaging_product"`
	To               string               `json:"to"`
	Type             string               `json:"type"`
	Template         templateMessageBody  `json:"template"`
}

type templateMessageBody struct {
	Name       string              `json:"name"`
	Language   templateLanguage    `json:"language"`
	Components []templateComponent `json:"components"`
}

type templateLanguage struct {
	Code string `json:"code"`
}

type templateComponent struct {
	Type       string              `json:"type"`
	Parameters []templateParameter `json:"parameters"`
}

type templateParameter struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// NotifyWebsiteOrderAsync sends a detailed WhatsApp alert to all configured owner phones.
// Safe after commit: goroutine, never fails the order, no-ops if Meta env is missing.
func NotifyWebsiteOrderAsync(alert OrderAlert) {
	go notifyWebsiteOrder(alert)
}

// NotifyNewOrderAsync keeps a minimal fallback for older call sites / tests.
func NotifyNewOrderAsync(orderID uuid.UUID, grandTotal int) {
	NotifyWebsiteOrderAsync(OrderAlert{
		OrderID:    orderID,
		GrandTotal: grandTotal,
	})
}

func notifyWebsiteOrder(alert OrderAlert) {
	token := strings.TrimSpace(os.Getenv("WHATSAPP_TOKEN"))
	phoneNumberID := strings.TrimSpace(os.Getenv("WHATSAPP_PHONE_NUMBER_ID"))
	phones := ownerPhones()
	if token == "" || phoneNumberID == "" || len(phones) == 0 {
		missingEnvOnce.Do(func() {
			log.Printf(
				"whatsapp notify: skipped — set WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_OWNER_PHONE on Render",
			)
		})
		return
	}

	url := graphAPIBase + "/" + phoneNumberID + "/messages"
	client := &http.Client{Timeout: 10 * time.Second}

	for _, to := range phones {
		if err := sendWebsiteOrderTemplate(client, url, token, to, alert); err != nil {
			log.Printf("whatsapp notify: send failed for order %s to %s: %v", alert.OrderID, to, err)
			continue
		}
		log.Printf("whatsapp notify: sent for order %s to %s", alert.OrderID, to)
	}
}

// SendWhatsAppText sends a plain-text WhatsApp message to one recipient.
// Used for password-reset replies (not order alerts).
func SendWhatsAppText(to, body string) error {
	token := strings.TrimSpace(os.Getenv("WHATSAPP_TOKEN"))
	phoneNumberID := strings.TrimSpace(os.Getenv("WHATSAPP_PHONE_NUMBER_ID"))
	if token == "" || phoneNumberID == "" {
		log.Printf("whatsapp send: not configured (token=%t phoneNumberID=%t)",
			token != "", phoneNumberID != "")
		return fmt.Errorf("whatsapp not configured")
	}
	normalized := utils.NormalizePhone(to)
	if normalized == "" {
		log.Printf("whatsapp send: invalid phone %q", to)
		return fmt.Errorf("invalid phone")
	}
	url := graphAPIBase + "/" + phoneNumberID + "/messages"
	log.Printf("whatsapp send: to=%q (from %q) phoneNumberID=%s", normalized, to, phoneNumberID)
	client := &http.Client{Timeout: 10 * time.Second}
	if err := sendWhatsAppText(client, url, token, normalized, body); err != nil {
		log.Printf("whatsapp send: FAILED to %q: %v", normalized, err)
		return err
	}
	log.Printf("whatsapp send: SUCCESS to %q", normalized)
	return nil
}

// NormalizePhone converts local PK numbers to international digits for WhatsApp API.
func NormalizePhone(raw string) string {
	return normalizePhone(raw)
}

func sendWebsiteOrderTemplate(client *http.Client, url, token, to string, alert OrderAlert) error {
	payload := buildWebsiteOrderTemplatePayload(to, alert)
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	log.Printf("whatsapp notify: sending template payload: %s", string(raw))

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("graph API %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	return nil
}

func buildWebsiteOrderTemplatePayload(to string, alert OrderAlert) templateMessagePayload {
	orderRef := strings.TrimSpace(alert.OrderNumber)
	if orderRef == "" {
		orderRef = alert.OrderID.String()
	}
	payment := strings.TrimSpace(alert.PaymentMethod)
	if payment != "" {
		payment = strings.ToUpper(payment)
	}

	return templateMessagePayload{
		MessagingProduct: "whatsapp",
		To:               to,
		Type:             "template",
		Template: templateMessageBody{
			Name:     websiteOrderTemplateName,
			Language: templateLanguage{Code: websiteOrderTemplateLang},
			Components: []templateComponent{{
				Type: "body",
				Parameters: []templateParameter{
					{Type: "text", Text: waParam(orderRef)},
					{Type: "text", Text: waParam(alert.CustomerName)},
					{Type: "text", Text: waParam(alert.Phone)},
					{Type: "text", Text: waParam(alert.Address)},
					{Type: "text", Text: waParam(alert.LocationName)},
					{Type: "text", Text: waParam(payment)},
					{Type: "text", Text: waParam(formatItemsTotalsNotesBlock(alert))},
				},
			}},
		},
	}
}

// waParam ensures Meta body parameters are never empty (empty → API reject).
func waParam(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "-"
	}
	return s
}

func sendWhatsAppText(client *http.Client, url, token, to, body string) error {
	payload := textMessagePayload{
		MessagingProduct: "whatsapp",
		To:               to,
		Type:             "text",
	}
	payload.Text.Body = body
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("graph API %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	return nil
}

func formatOrderAlert(a OrderAlert) string {
	ref := strings.TrimSpace(a.OrderNumber)
	if ref == "" {
		ref = a.OrderID.String()
	}
	var b strings.Builder
	b.WriteString("New website order\n")
	b.WriteString(fmt.Sprintf("Order: %s\n", ref))
	if a.CustomerName != "" {
		b.WriteString(fmt.Sprintf("Customer: %s\n", a.CustomerName))
	}
	if a.Phone != "" {
		b.WriteString(fmt.Sprintf("Phone: %s\n", a.Phone))
	}
	if a.Address != "" {
		b.WriteString(fmt.Sprintf("Address: %s\n", a.Address))
	}
	if a.LocationName != "" {
		b.WriteString(fmt.Sprintf("Area: %s\n", a.LocationName))
	}
	if a.PaymentMethod != "" {
		b.WriteString(fmt.Sprintf("Payment: %s\n", strings.ToUpper(a.PaymentMethod)))
	}
	b.WriteString(formatItemsTotalsNotesBlock(a))
	return b.String()
}

// formatItemsTotalsNotesBlock is template body parameter 7: items, money, notes.
// Meta rejects newlines in template parameters, so segments are joined with " | ".
func formatItemsTotalsNotesBlock(a OrderAlert) string {
	parts := make([]string, 0, 8)
	if len(a.Items) > 0 {
		itemBits := make([]string, 0, len(a.Items)*2)
		for _, it := range a.Items {
			label := it.Name
			if it.Size != "" {
				label += " (" + it.Size + ")"
			}
			itemBits = append(itemBits, fmt.Sprintf("%dx %s - Rs.%d", it.Quantity, label, it.LineTotal))
			if strings.TrimSpace(it.Instructions) != "" {
				itemBits = append(itemBits, "note: "+strings.TrimSpace(it.Instructions))
			}
		}
		parts = append(parts, "Items: "+strings.Join(itemBits, " | "))
	}
	parts = append(parts, fmt.Sprintf("Subtotal: Rs.%d", a.Subtotal))
	if a.Discount > 0 {
		parts = append(parts, fmt.Sprintf("Discount: -Rs.%d", a.Discount))
	}
	if a.Delivery > 0 {
		parts = append(parts, fmt.Sprintf("Delivery: Rs.%d", a.Delivery))
	}
	if a.CODFee > 0 {
		parts = append(parts, fmt.Sprintf("COD fee: Rs.%d", a.CODFee))
	}
	parts = append(parts, fmt.Sprintf("Total: Rs.%d", a.GrandTotal))
	if strings.TrimSpace(a.OrderNotes) != "" {
		parts = append(parts, "Notes: "+strings.TrimSpace(a.OrderNotes))
	}
	return strings.Join(parts, " | ")
}

// ownerPhones = WHATSAPP_OWNER_PHONE (comma-separated). No hardcoded extra shop number.
func ownerPhones() []string {
	raw := os.Getenv("WHATSAPP_OWNER_PHONE")
	if extra := strings.TrimSpace(os.Getenv("WHATSAPP_OWNER_PHONES")); extra != "" {
		if raw != "" {
			raw = raw + "," + extra
		} else {
			raw = extra
		}
	}
	seen := map[string]bool{}
	out := make([]string, 0, 4)
	add := func(p string) {
		p = normalizePhone(p)
		if p == "" || seen[p] {
			return
		}
		seen[p] = true
		out = append(out, p)
	}
	for _, part := range strings.Split(raw, ",") {
		add(part)
	}
	return out
}

func normalizePhone(raw string) string {
	return utils.NormalizePhone(raw)
}
