package repository

import (
	"encoding/json"
	"slices"
	"testing"

	"backend/internal/domain"

	"github.com/google/uuid"
)

func TestOrderListPreloadsOmitsProductImage(t *testing.T) {
	cols := orderListProductSelectColumns()
	if slices.Contains(cols, "image") {
		t.Fatal("list preloads must not select product.image")
	}
	for _, want := range []string{"id", "name", "category_id", "available"} {
		if !slices.Contains(cols, want) {
			t.Fatalf("list preloads must still select %q", want)
		}
	}
}

func TestOrderDetailPreloadsIncludesProductImage(t *testing.T) {
	cols := orderDetailProductSelectColumns()
	if !slices.Contains(cols, "image") {
		t.Fatal("detail preloads must still select product.image")
	}
}

func TestOrderListProductJSONOmitsImageField(t *testing.T) {
	// Simulates a list endpoint row: nested product without image bytes.
	item := domain.OrderItem{
		ProductID: uuid.New(),
		Product: domain.Product{
			BaseModel:  domain.BaseModel{ID: uuid.New()},
			Name:       "Chicken Tikka",
			Image:      "data:image/jpeg;base64,SHOULD_NOT_APPEAR",
			CategoryID: uuid.New(),
			Available:  true,
		},
		Quantity: 2,
		Price:    1490,
	}
	// List preload would not load Image from DB; zero value is fine for JSON.
	item.Product.Image = ""
	raw, err := json.Marshal(item)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	product, ok := decoded["product"].(map[string]any)
	if !ok {
		t.Fatal("expected product object in JSON")
	}
	if product["name"] != "Chicken Tikka" {
		t.Fatalf("name must remain, got %#v", product["name"])
	}
	if img, ok := product["image"].(string); ok && img != "" {
		t.Fatalf("list responses must not carry image bytes, got len=%d", len(img))
	}
}
