package utils

import (
	"regexp"
	"strings"
)

var nonDigit = regexp.MustCompile(`\D+`)

// NormalizePhone converts local PK numbers (03XXXXXXXXX) to international digits (923XXXXXXXXX).
func NormalizePhone(raw string) string {
	digits := nonDigit.ReplaceAllString(strings.TrimSpace(raw), "")
	if digits == "" {
		return ""
	}
	if strings.HasPrefix(digits, "0") && len(digits) == 11 {
		digits = "92" + digits[1:]
	}
	return digits
}

// PhoneLookupVariants returns local and international forms for DB lookup.
func PhoneLookupVariants(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	intl := NormalizePhone(raw)
	out := []string{raw}
	if intl != "" && intl != raw {
		out = append(out, intl)
	}
	if strings.HasPrefix(intl, "92") && len(intl) >= 12 {
		out = append(out, "0"+intl[2:])
	}
	if strings.HasPrefix(raw, "0") && len(raw) == 11 {
		out = append(out, "92"+raw[1:])
	}
	seen := map[string]bool{}
	unique := make([]string, 0, len(out))
	for _, p := range out {
		if p == "" || seen[p] {
			continue
		}
		seen[p] = true
		unique = append(unique, p)
	}
	return unique
}
