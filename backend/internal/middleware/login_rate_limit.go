package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"backend/internal/utils"

	"github.com/gin-gonic/gin"
)

// loginAttempt tracks failed logins for a single key (IP + account).
type loginAttempt struct {
	failures  int
	lockedUntil time.Time
	windowStart time.Time
}

// LoginRateLimiter is an in-memory failed-login limiter.
// Safe for a single Render instance (sufficient for this POS API).
type LoginRateLimiter struct {
	mu       sync.Mutex
	attempts map[string]*loginAttempt

	maxFailures int
	window      time.Duration
	baseLock    time.Duration
	maxLock     time.Duration
}

func NewLoginRateLimiter() *LoginRateLimiter {
	return &LoginRateLimiter{
		attempts:    make(map[string]*loginAttempt),
		maxFailures: 5,
		window:      15 * time.Minute,
		baseLock:    30 * time.Second,
		maxLock:     15 * time.Minute,
	}
}

func ClientIP(c *gin.Context) string {
	if xff := strings.TrimSpace(c.GetHeader("X-Forwarded-For")); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xri := strings.TrimSpace(c.GetHeader("X-Real-IP")); xri != "" {
		return xri
	}
	ip := c.ClientIP()
	if ip == "" {
		return "unknown"
	}
	return ip
}

func (l *LoginRateLimiter) key(ip, account string) string {
	return strings.ToLower(strings.TrimSpace(ip)) + "|" + strings.ToLower(strings.TrimSpace(account))
}

// Check returns an error if the account/IP is currently locked out.
func (l *LoginRateLimiter) Check(ip, account string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.pruneLocked()
	key := l.key(ip, account)
	a := l.attempts[key]
	if a == nil {
		return nil
	}
	now := time.Now()
	if now.Before(a.lockedUntil) {
		secs := int(a.lockedUntil.Sub(now).Seconds()) + 1
		return utils.NewAppError(http.StatusTooManyRequests,
			"too many failed login attempts — try again in "+itoa(secs)+"s")
	}
	return nil
}

// RecordFailure increments the failure count and may start/extend a lockout.
func (l *LoginRateLimiter) RecordFailure(ip, account string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	key := l.key(ip, account)
	a := l.attempts[key]
	if a == nil || now.Sub(a.windowStart) > l.window {
		a = &loginAttempt{windowStart: now}
		l.attempts[key] = a
	}
	a.failures++
	if a.failures >= l.maxFailures {
		// Increasing lock: 30s, 60s, 120s… capped at maxLock.
		extra := a.failures - l.maxFailures
		lock := l.baseLock << extra
		if lock > l.maxLock || lock <= 0 {
			lock = l.maxLock
		}
		a.lockedUntil = now.Add(lock)
	}
}

// RecordSuccess clears the failure window for this account/IP.
func (l *LoginRateLimiter) RecordSuccess(ip, account string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, l.key(ip, account))
}

func (l *LoginRateLimiter) pruneLocked() {
	now := time.Now()
	for k, a := range l.attempts {
		if now.Sub(a.windowStart) > l.window && now.After(a.lockedUntil) {
			delete(l.attempts, k)
		}
	}
}

func itoa(n int) string {
	if n <= 0 {
		return "0"
	}
	var b [16]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// AccountFromBody peeks a common identity field from a login JSON body
// without consuming the request (caller binds afterward from a restored body).
// Prefer using the already-bound DTO in the handler instead.
func AccountFromStaff(username string) string {
	return strings.TrimSpace(username)
}

func AccountFromCustomer(phone string) string {
	return strings.TrimSpace(phone)
}
