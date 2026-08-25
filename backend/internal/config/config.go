package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"

	"github.com/go-playground/validator/v10"
	"github.com/joho/godotenv"
)

type Config struct {
	Port       string           `validate:"required,numeric"`
	Database   DatabaseConfig   `validate:"required"`
	JWT        JWTConfig        `validate:"required"`
	Cloudinary CloudinaryConfig // optional until staff upload images
}

type DatabaseConfig struct {
	Host     string `validate:"required"`
	Port     string `validate:"required,numeric"`
	User     string `validate:"required"`
	Password string `validate:"required"`
	Name     string `validate:"required"`
	SSLMode  string `validate:"required,oneof=disable allow prefer require verify-ca verify-full"`
}

type JWTConfig struct {
	Secret string `validate:"required,min=16"`
}

type CloudinaryConfig struct {
	CloudName string
	APIKey    string
	APISecret string
}

func (c CloudinaryConfig) Configured() bool {
	return strings.TrimSpace(c.CloudName) != "" &&
		strings.TrimSpace(c.APIKey) != "" &&
		strings.TrimSpace(c.APISecret) != ""
}

var (
	cfg     *Config
	loadErr error
	once    sync.Once
)

func Load() (*Config, error) {
	once.Do(func() {
		_ = godotenv.Load(".env.local", ".env", "../../.env.local", "../../.env")

		dbCfg, err := loadDatabaseConfig()
		if err != nil {
			loadErr = err
			return
		}

		loaded := &Config{
			// Platforms (Render/Railway/Fly) inject PORT; keep APP_PORT for local.
			Port:     firstNonEmpty(getEnv("PORT"), getEnv("APP_PORT"), "8080"),
			Database: dbCfg,
			JWT: JWTConfig{
				Secret: getEnv("JWT_SECRET"),
			},
			Cloudinary: CloudinaryConfig{
				CloudName: getEnv("CLOUDINARY_CLOUD_NAME"),
				APIKey:    getEnv("CLOUDINARY_API_KEY"),
				APISecret: getEnv("CLOUDINARY_API_SECRET"),
			},
		}

		validate := validator.New()
		if err := validate.Struct(loaded); err != nil {
			loadErr = fmt.Errorf("invalid configuration: %w", err)
			return
		}

		cfg = loaded
	})

	return cfg, loadErr
}

func MustLoad() *Config {
	loaded, err := Load()
	if err != nil {
		panic(err)
	}

	return loaded
}

func loadDatabaseConfig() (DatabaseConfig, error) {
	if raw := strings.TrimSpace(getEnv("DATABASE_URL")); raw != "" {
		parsed, err := parseDatabaseURL(raw)
		if err != nil {
			return DatabaseConfig{}, fmt.Errorf("invalid DATABASE_URL: %w", err)
		}
		return parsed, nil
	}

	return DatabaseConfig{
		Host:     getEnv("DB_HOST"),
		Port:     firstNonEmpty(getEnv("DB_PORT"), "5432"),
		User:     getEnv("DB_USER"),
		Password: getEnv("DB_PASSWORD"),
		Name:     getEnv("DB_NAME"),
		SSLMode:  firstNonEmpty(getEnv("DB_SSLMODE"), "disable"),
	}, nil
}

func parseDatabaseURL(raw string) (DatabaseConfig, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return DatabaseConfig{}, err
	}
	if u.Scheme != "postgres" && u.Scheme != "postgresql" {
		return DatabaseConfig{}, fmt.Errorf("unsupported scheme %q (expected postgres)", u.Scheme)
	}

	password, _ := u.User.Password()
	dbName := strings.TrimPrefix(u.Path, "/")
	if dbName == "" {
		return DatabaseConfig{}, fmt.Errorf("database name missing in path")
	}

	port := u.Port()
	if port == "" {
		port = "5432"
	}

	sslMode := u.Query().Get("sslmode")
	if sslMode == "" {
		sslMode = "require"
	}

	return DatabaseConfig{
		Host:     u.Hostname(),
		Port:     port,
		User:     u.User.Username(),
		Password: password,
		Name:     dbName,
		SSLMode:  sslMode,
	}, nil
}

func getEnv(key string) string {
	return os.Getenv(key)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
