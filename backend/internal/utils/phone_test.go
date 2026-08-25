package utils

import "testing"

func TestNormalizePhone_PakistanLocal(t *testing.T) {
	if got := NormalizePhone("03000128562"); got != "923000128562" {
		t.Fatalf("got %s", got)
	}
	if got := NormalizePhone("+92 300 0128562"); got != "923000128562" {
		t.Fatalf("got %s", got)
	}
}

func TestPhoneLookupVariants(t *testing.T) {
	variants := PhoneLookupVariants("923001234567")
	found := false
	for _, v := range variants {
		if v == "03001234567" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected local variant, got %v", variants)
	}
}

func TestHashToken_Deterministic(t *testing.T) {
	a := HashToken("abc")
	b := HashToken("abc")
	if a != b || len(a) != 64 {
		t.Fatalf("unexpected hash: %s", a)
	}
}
