package middleware

import (
	"errors"
	"net/http"
	"testing"
	"time"

	"backend/internal/utils"
)

func TestLoginRateLimiter_LockoutAfterFailures(t *testing.T) {
	l := NewLoginRateLimiter()
	l.maxFailures = 3
	l.baseLock = 2 * time.Second
	l.maxLock = 10 * time.Second
	l.window = time.Minute

	ip, account := "1.2.3.4", "admin"
	for i := 0; i < 3; i++ {
		if err := l.Check(ip, account); err != nil {
			t.Fatalf("unexpected lock before threshold: %v", err)
		}
		l.RecordFailure(ip, account)
	}
	err := l.Check(ip, account)
	if err == nil {
		t.Fatal("expected lockout after max failures")
	}
	var appErr *utils.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("expected AppError, got %T", err)
	}
	if appErr.Status != http.StatusTooManyRequests {
		t.Fatalf("status=%d want 429", appErr.Status)
	}
	l.RecordSuccess(ip, account)
	if err := l.Check(ip, account); err != nil {
		t.Fatalf("expected clear after success: %v", err)
	}
}

func TestLoginRateLimiter_DifferentAccountsIndependent(t *testing.T) {
	l := NewLoginRateLimiter()
	l.maxFailures = 2
	ip := "10.0.0.1"
	for i := 0; i < 2; i++ {
		l.RecordFailure(ip, "alice")
	}
	if err := l.Check(ip, "alice"); err == nil {
		t.Fatal("alice should be locked")
	}
	if err := l.Check(ip, "bob"); err != nil {
		t.Fatalf("bob should not be locked: %v", err)
	}
}
