package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestParseSinceQueryEmpty(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, "/orders?limit=200", nil)
	since, err := parseSinceQuery(c)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if since != nil {
		t.Fatalf("expected nil since, got %v", since)
	}
}

func TestParseSinceQueryRFC3339(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(
		http.MethodGet,
		"/orders?since=2026-08-17T05:00:00Z",
		nil,
	)
	since, err := parseSinceQuery(c)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if since == nil {
		t.Fatal("expected since")
	}
	want := time.Date(2026, 8, 17, 5, 0, 0, 0, time.UTC)
	if !since.Equal(want) {
		t.Fatalf("got %v want %v", since, want)
	}
}

func TestParseSinceQueryInvalid(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, "/orders?since=not-a-date", nil)
	_, err := parseSinceQuery(c)
	if err == nil {
		t.Fatal("expected error for invalid since")
	}
}
