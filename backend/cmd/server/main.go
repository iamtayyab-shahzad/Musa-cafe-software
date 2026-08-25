package main

import (
	"os"

	"backend/internal/config"
	"backend/internal/database"
	"backend/internal/logger"
	"backend/internal/routes"
	"backend/internal/service"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration_error", map[string]any{"error": err.Error()})
		panic(err)
	}

	if os.Getenv("APP_ENV") == "production" || os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	logger.Info("database_target", map[string]any{
		"host":    cfg.Database.Host,
		"port":    cfg.Database.Port,
		"db":      cfg.Database.Name,
		"user":    cfg.Database.User,
		"sslmode": cfg.Database.SSLMode,
	})

	db, err := database.Initialize(cfg.Database)
	if err != nil {
		logger.Error("database_connect_failed", map[string]any{"error": err.Error()})
		panic(err)
	}
	logger.Info("database_connected", nil)

	services := service.NewAppServices(db, cfg.JWT.Secret)
	router := routes.SetupRouter(services, cfg.JWT.Secret, cfg.Cloudinary)

	logger.Info("server_starting", map[string]any{"port": cfg.Port})
	if err := router.Run(":" + cfg.Port); err != nil {
		logger.Error("server_start_failed", map[string]any{"error": err.Error()})
		panic(err)
	}
}
