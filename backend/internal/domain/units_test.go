package domain

import "testing"

func TestBaseUnitForKind(t *testing.T) {
	cases := map[string]string{
		"WEIGHT": "g",
		"weight": "g",
		"VOLUME": "ml",
		"COUNT":  "pcs",
		"":       "g",
	}
	for in, want := range cases {
		if got := BaseUnitForKind(in); got != want {
			t.Fatalf("BaseUnitForKind(%q)=%q want %q", in, got, want)
		}
	}
}

func TestDefaultUnitsPerPurchase(t *testing.T) {
	cases := map[string]int64{
		"KG":     1000,
		"kg":     1000,
		"Litre":  1000,
		"ml":     1,
		"Carton": 24,
		"dozen":  12,
		"pcs":    1,
		"Packet": 1,
	}
	for in, want := range cases {
		if got := DefaultUnitsPerPurchase(in); got != want {
			t.Fatalf("DefaultUnitsPerPurchase(%q)=%d want %d", in, got, want)
		}
	}
}

func TestCostMicrosRoundTrip(t *testing.T) {
	// Cheese: Rs 1200 / KG = Rs 1.2 / g
	micros := CostMicrosPerBaseUnit(1200, 1000)
	if micros != 1_200_000 {
		t.Fatalf("expected 1200000 micros/g, got %d", micros)
	}
	// 250 g of cheese should cost Rs 300
	if got := ValueFromMicros(micros, 250); got != 300 {
		t.Fatalf("expected Rs 300, got %d", got)
	}
}

func TestNormalizeUnitKind(t *testing.T) {
	if got := NormalizeUnitKind("volume"); got != UnitKindVolume {
		t.Fatalf("got %q", got)
	}
	if got := NormalizeUnitKind("bogus"); got != UnitKindWeight {
		t.Fatalf("got %q", got)
	}
}
