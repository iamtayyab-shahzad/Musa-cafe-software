package cloudinary

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"backend/internal/config"
)

var (
	ErrNotConfigured = errors.New("cloudinary is not configured")
	ErrEmptyFile     = errors.New("image file is empty")
	ErrTooLarge      = errors.New("image is too large (max 2MB)")
)

const maxUploadBytes = 2 * 1024 * 1024

func MaxUploadBytes() int { return maxUploadBytes }

type uploadAPIResponse struct {
	SecureURL string `json:"secure_url"`
	Error     struct {
		Message string `json:"message"`
	} `json:"error"`
}

// Signature is Cloudinary's SHA-1 signed-parameter digest.
// Keys are sorted alphabetically; empty values are omitted; the API secret is appended.
func Signature(params map[string]string, apiSecret string) string {
	keys := make([]string, 0, len(params))
	for k, v := range params {
		if strings.TrimSpace(v) == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte('&')
		}
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(params[k])
	}
	b.WriteString(apiSecret)
	sum := sha1.Sum([]byte(b.String()))
	return hex.EncodeToString(sum[:])
}

// UploadImage sends a signed image upload and returns the HTTPS delivery URL only.
func UploadImage(ctx context.Context, cfg config.CloudinaryConfig, folder string, r io.Reader, filename string) (string, error) {
	if !cfg.Configured() {
		return "", ErrNotConfigured
	}
	if r == nil {
		return "", ErrEmptyFile
	}
	if strings.TrimSpace(filename) == "" {
		filename = "photo.jpg"
	}

	payload, err := io.ReadAll(io.LimitReader(r, maxUploadBytes+1))
	if err != nil {
		return "", err
	}
	if len(payload) == 0 {
		return "", ErrEmptyFile
	}
	if len(payload) > maxUploadBytes {
		return "", ErrTooLarge
	}

	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	params := map[string]string{"timestamp": timestamp}
	folder = strings.TrimSpace(folder)
	if folder != "" {
		params["folder"] = folder
	}
	sig := Signature(params, cfg.APISecret)

	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	if err := mw.WriteField("api_key", cfg.APIKey); err != nil {
		return "", err
	}
	if err := mw.WriteField("timestamp", timestamp); err != nil {
		return "", err
	}
	if err := mw.WriteField("signature", sig); err != nil {
		return "", err
	}
	if folder != "" {
		if err := mw.WriteField("folder", folder); err != nil {
			return "", err
		}
	}
	part, err := mw.CreateFormFile("file", filename)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(payload); err != nil {
		return "", err
	}
	if err := mw.Close(); err != nil {
		return "", err
	}

	endpoint := fmt.Sprintf("https://api.cloudinary.com/v1_1/%s/image/upload", cfg.CloudName)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("cloudinary request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var parsed uploadAPIResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("cloudinary returned an unreadable response")
	}
	if resp.StatusCode >= 400 || strings.TrimSpace(parsed.SecureURL) == "" {
		msg := strings.TrimSpace(parsed.Error.Message)
		if msg == "" {
			msg = fmt.Sprintf("cloudinary upload failed (%d)", resp.StatusCode)
		}
		return "", fmt.Errorf("%s", msg)
	}
	return parsed.SecureURL, nil
}
