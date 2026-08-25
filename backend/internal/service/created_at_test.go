package service

import (
	"testing"
	"time"
)

func TestResolveClientCreatedAt_keepsOriginalTillTime(t *testing.T) {
	original := time.Date(2026, 8, 8, 14, 30, 0, 0, time.UTC)
	got := resolveClientCreatedAt(&original)
	if !got.Equal(original.UTC()) {
		t.Fatalf("expected original till time, got %s", got)
	}
}

func TestResolveClientCreatedAt_rejectsFuture(t *testing.T) {
	future := time.Now().UTC().Add(24 * time.Hour)
	got := resolveClientCreatedAt(&future)
	if got.After(time.Now().UTC().Add(time.Minute)) {
		t.Fatalf("future created_at should be clamped to now, got %s", got)
	}
}

func TestResolveClientCreatedAt_nilUsesNow(t *testing.T) {
	before := time.Now().UTC().Add(-time.Second)
	got := resolveClientCreatedAt(nil)
	if got.Before(before) {
		t.Fatalf("nil should use now, got %s", got)
	}
}
