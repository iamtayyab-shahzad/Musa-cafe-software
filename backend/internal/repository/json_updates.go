package repository

import (
	"encoding/json"
	"math"
	"strings"
)

var skipUpdateKeys = map[string]struct{}{
	"id":         {},
	"created_at": {},
	"updated_at": {},
	"category":   {},
	"sizes":      {},
	"product":    {},
	"items":      {},
}

// NormalizeJSONUpdates converts Gin/JSON map values into types Postgres/GORM
// can write. encoding/json stores numbers as float64 in map[string]any, and
// pgx rejects float64 for integer columns (price, display_order) as a 500.
func NormalizeJSONUpdates(updates map[string]any) map[string]any {
	out := make(map[string]any, len(updates))
	for key, value := range updates {
		if _, skip := skipUpdateKeys[strings.ToLower(key)]; skip {
			continue
		}
		out[key] = coerceJSONValue(value)
	}
	return out
}

func coerceJSONValue(value any) any {
	switch n := value.(type) {
	case float64:
		if n == math.Trunc(n) && n >= math.MinInt64 && n <= math.MaxInt64 {
			return int64(n)
		}
		return n
	case json.Number:
		if i, err := n.Int64(); err == nil {
			return i
		}
		if f, err := n.Float64(); err == nil {
			return f
		}
		return n.String()
	default:
		return value
	}
}
