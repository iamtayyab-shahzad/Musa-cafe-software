package shop

import (
	"encoding/json"
	"os"
	"strings"
	"sync"
)

// Info is the shop identity loaded from shared/shop.json (env can override).
type Info struct {
	Name         string
	ShortName    string
	Phone        string
	WhatsApp     string
	OpeningTime  string
	ClosingTime  string
	Currency     string
	SiteURL      string
	OrderPrefix  string
}

type fileShape struct {
	Name         string `json:"name"`
	ShortName    string `json:"shortName"`
	Phone        string `json:"phone"`
	WhatsApp     string `json:"whatsapp"`
	OpeningTime  string `json:"openingTime"`
	ClosingTime  string `json:"closingTime"`
	Currency     string `json:"currency"`
	SiteURL      string `json:"siteUrl"`
	OrderPrefix  string `json:"orderPrefix"`
}

var (
	once sync.Once
	info Info
)

func defaults() Info {
	return Info{
		Name:        "Musa Cafe",
		ShortName:   "Musa",
		Phone:       "03095997786",
		WhatsApp:    "923095997786",
		OpeningTime: "10:00 AM",
		ClosingTime: "12:00 AM",
		Currency:    "Rs",
		SiteURL:     "http://localhost:3000",
		OrderPrefix: "MC",
	}
}

func loadFile() (fileShape, bool) {
	paths := []string{
		os.Getenv("SHOP_FILE"),
		"../shared/shop.json",
		"shared/shop.json",
		"../../shared/shop.json",
	}
	for _, p := range paths {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		raw, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		var parsed fileShape
		if json.Unmarshal(raw, &parsed) != nil {
			continue
		}
		return parsed, true
	}
	return fileShape{}, false
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// Current returns shop identity. Safe to call from any package.
func Current() Info {
	once.Do(func() {
		d := defaults()
		f, ok := loadFile()
		if !ok {
			f = fileShape{}
		}
		info = Info{
			Name: firstNonEmpty(os.Getenv("SHOP_NAME"), f.Name, d.Name),
			ShortName: firstNonEmpty(os.Getenv("SHOP_SHORT_NAME"), f.ShortName, d.ShortName),
			Phone: firstNonEmpty(os.Getenv("SHOP_PHONE"), f.Phone, d.Phone),
			WhatsApp: firstNonEmpty(os.Getenv("SHOP_WHATSAPP"), f.WhatsApp, d.WhatsApp),
			OpeningTime: firstNonEmpty(os.Getenv("SHOP_OPENING_TIME"), f.OpeningTime, d.OpeningTime),
			ClosingTime: firstNonEmpty(os.Getenv("SHOP_CLOSING_TIME"), f.ClosingTime, d.ClosingTime),
			Currency: firstNonEmpty(os.Getenv("SHOP_CURRENCY"), f.Currency, d.Currency),
			SiteURL: strings.TrimRight(firstNonEmpty(os.Getenv("SITE_URL"), f.SiteURL, d.SiteURL), "/"),
			OrderPrefix: strings.Trim(firstNonEmpty(os.Getenv("ORDER_PREFIX"), f.OrderPrefix, d.OrderPrefix), "-"),
		}
		if info.OrderPrefix == "" {
			info.OrderPrefix = "MC"
		}
	})
	return info
}
