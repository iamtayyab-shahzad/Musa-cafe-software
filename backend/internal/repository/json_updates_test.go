package repository

import (
	"testing"
)

func TestNormalizeJSONUpdatesCoercesInts(t *testing.T) {
	out := NormalizeJSONUpdates(map[string]any{
		"price":         float64(650),
		"display_order": float64(3),
		"featured":      true,
		"name":          "Chicken Tika",
		"id":            "should-drop",
		"sizes":         []any{},
	})
	if _, ok := out["id"]; ok {
		t.Fatal("id must not be written via Updates")
	}
	if _, ok := out["sizes"]; ok {
		t.Fatal("association sizes must not be written via Updates")
	}
	price, ok := out["price"].(int64)
	if !ok || price != 650 {
		t.Fatalf("price want int64(650), got %#v", out["price"])
	}
	order, ok := out["display_order"].(int64)
	if !ok || order != 3 {
		t.Fatalf("display_order want int64(3), got %#v", out["display_order"])
	}
	if out["featured"] != true || out["name"] != "Chicken Tika" {
		t.Fatalf("other fields changed: %#v", out)
	}
}
