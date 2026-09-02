package utils

import (
	"testing"
	"time"
)

func TestBusinessDateYMD_Karachi(t *testing.T) {
	// 2026-09-02 22:30 UTC = 2026-09-03 03:30 Asia/Karachi
	ts, err := time.Parse(time.RFC3339, "2026-09-02T22:30:00Z")
	if err != nil {
		t.Fatal(err)
	}
	got := BusinessDateYMD(ts)
	if got != "2026-09-03" {
		t.Fatalf("got %s want 2026-09-03", got)
	}

	// Still previous Karachi day just before midnight PKT
	ts2, err := time.Parse(time.RFC3339, "2026-09-02T18:59:00Z")
	if err != nil {
		t.Fatal(err)
	}
	got2 := BusinessDateYMD(ts2)
	if got2 != "2026-09-02" {
		t.Fatalf("got %s want 2026-09-02", got2)
	}
}
