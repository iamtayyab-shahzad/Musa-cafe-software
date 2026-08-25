package service

import (
	"testing"

	"backend/internal/domain"

	"github.com/google/uuid"
)

func TestPickRecipeLinesPrefersSizedThenGeneric(t *testing.T) {
	productID := uuid.New()
	sizeL := uuid.New()
	sizeM := uuid.New()
	inv := uuid.New()

	sizedL := domain.Recipe{
		ProductID: productID, ProductSizeID: &sizeL, InventoryID: inv, QuantityRequired: 200,
	}
	generic := domain.Recipe{
		ProductID: productID, ProductSizeID: nil, InventoryID: inv, QuantityRequired: 100,
	}
	sizedM := domain.Recipe{
		ProductID: productID, ProductSizeID: &sizeM, InventoryID: inv, QuantityRequired: 150,
	}
	all := []domain.Recipe{sizedL, generic, sizedM}

	got := pickRecipeLines(all, sizeL)
	if len(got) != 1 || got[0].QuantityRequired != 200 {
		t.Fatalf("expected Large-sized recipe only, got %+v", got)
	}

	got = pickRecipeLines(all, uuid.New()) // unknown size → generic
	if len(got) != 1 || got[0].QuantityRequired != 100 {
		t.Fatalf("expected generic fallback, got %+v", got)
	}

	got = pickRecipeLines([]domain.Recipe{sizedL}, sizeM)
	if len(got) != 0 {
		t.Fatalf("expected empty when only other size exists, got %+v", got)
	}
}
