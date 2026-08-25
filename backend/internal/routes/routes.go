package routes

import (
	"net/http"

	"backend/internal/config"
	"backend/internal/domain"
	"backend/internal/handler"
	"backend/internal/middleware"
	"backend/internal/service"
	"backend/internal/shop"

	"github.com/gin-gonic/gin"
)

func SetupRouter(services *service.AppServices, jwtSecret string, cloudinaryCfg config.CloudinaryConfig) *gin.Engine {
	router := gin.New()
	router.Use(
		middleware.RequestID(),
		middleware.CORS(),
		middleware.Gzip(),
		middleware.MaxBodyBytes(middleware.DefaultMaxBodyBytes),
		middleware.RequestLogger(),
		middleware.ErrorRecovery(),
	)

	router.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": shop.Current().Name + " API running",
			"docs":    "/swagger/index.html",
		})
	})
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	router.GET("/api/v1/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	authHandler := handler.NewAuthHandler(services.Auth)
	whatsappWebhookHandler := handler.NewWhatsAppWebhookHandler(services.Auth)

	router.GET("/webhook/whatsapp", whatsappWebhookHandler.Verify)
	router.POST("/webhook/whatsapp", whatsappWebhookHandler.Receive)

	router.Static("/swagger", "./docs/swagger")
	router.StaticFile("/openapi.yaml", "./docs/openapi.yaml")

	customerHandler := handler.NewCustomerHandler(services.Auth, services.Orders)
	categoryHandler := handler.NewCRUDHandler[domain.Category](services.Categories, "category")
	productHandler := handler.NewCRUDHandler[domain.Product](services.Products, "product")
	productSizeHandler := handler.NewCRUDHandler[domain.ProductSize](services.ProductSizes, "product size")
	locationHandler := handler.NewCRUDHandler[domain.Location](services.Locations, "location")
	offerHandler := handler.NewOfferHandler(services.Offers)
	discountRuleHandler := handler.NewDiscountRuleHandler(services.DiscountRules)
	inventoryHandler := handler.NewInventoryHandler(services.Inventory)
	inventoryTxHandler := handler.NewInventoryTransactionHandler(services.InventoryTransactions)
	recipeHandler := handler.NewRecipeHandler(services.Recipes)
	supplierHandler := handler.NewSupplierHandler(services.Suppliers)
	purchaseHandler := handler.NewPurchaseHandler(services.Purchases)
	expenseHandler := handler.NewExpenseHandler(services.Expenses)
	reportHandler := handler.NewReportHandler(services.Reports)
	catalogHandler := handler.NewCatalogHandler(services.Catalog)
	orderHandler := handler.NewOrderHandler(services.Orders)
	paymentHandler := handler.NewPaymentHandler(services.Payments)
	analyticsHandler := handler.NewAnalyticsHandler(services.Analytics)
	settingHandler := handler.NewSettingHandler(services.Settings)
	uploadHandler := handler.NewUploadHandler(cloudinaryCfg, "musacafe")

	api := router.Group("/api/v1")
	{
		auth := api.Group("/auth")
		{
			auth.POST("/staff/login", authHandler.StaffLogin)
			auth.POST("/customers/register", authHandler.CustomerRegister)
			auth.POST("/customers/login", authHandler.CustomerLogin)
			auth.POST("/customers/reset-password", authHandler.CustomerResetPassword)
		}

		customers := api.Group("/customers")
		customers.Use(middleware.JWTAuth(jwtSecret, "customer"))
		{
			customers.GET("/me", customerHandler.GetMe)
			customers.PATCH("/me", customerHandler.UpdateMe)
			customers.GET("/me/orders", customerHandler.ListMyOrders)
		}

		// Public order creation (guest checkout supported)
		ordersPublic := api.Group("/orders")
		ordersPublic.Use(middleware.OptionalJWT(jwtSecret, "customer", "staff"))
		{
			ordersPublic.POST("", orderHandler.Create)
		}

		// Public settings read for website/POS bootstrap
		api.GET("/settings/public", settingHandler.Get)

		// Public catalog reads used by Website (and POS can also call these)
		api.GET("/categories", categoryHandler.List)
		api.GET("/categories/:id", categoryHandler.GetByID)
		api.GET("/products", productHandler.List)
		api.GET("/products/:id", productHandler.GetByID)
		api.GET("/product-sizes", productSizeHandler.List)
		api.GET("/product-sizes/:id", productSizeHandler.GetByID)
		api.GET("/locations", locationHandler.List)
		api.GET("/locations/:id", locationHandler.GetByID)
		api.GET("/offers", offerHandler.List)
		api.GET("/offers/:id", offerHandler.GetByID)
		api.GET("/discount-rules/active", discountRuleHandler.ListActive)

		staff := api.Group("")
		staff.Use(middleware.JWTAuth(jwtSecret, "staff"))
		{
			// Mutations require staff JWT
			staff.POST("/categories", categoryHandler.Create)
			staff.PUT("/categories/:id", categoryHandler.Update)
			staff.DELETE("/categories/:id", catalogHandler.DeleteCategory)

			staff.POST("/products", productHandler.Create)
			staff.PUT("/products/:id", productHandler.Update)
			staff.DELETE("/products/:id", catalogHandler.DeleteProduct)

			staff.POST("/product-sizes", productSizeHandler.Create)
			staff.PUT("/product-sizes/:id", productSizeHandler.Update)
			staff.DELETE("/product-sizes/:id", catalogHandler.DeleteProductSize)

			staff.POST("/locations", locationHandler.Create)
			staff.PUT("/locations/:id", locationHandler.Update)
			staff.DELETE("/locations/:id", catalogHandler.DeleteLocation)

			staff.POST("/offers", offerHandler.Create)
			staff.PUT("/offers/:id", offerHandler.Update)
			staff.DELETE("/offers/:id", offerHandler.Delete)
			staff.PATCH("/offers/:id/enable", offerHandler.Enable)
			staff.PATCH("/offers/:id/disable", offerHandler.Disable)

			staff.GET("/discount-rules", discountRuleHandler.List)
			staff.POST("/discount-rules", discountRuleHandler.Create)
			staff.GET("/discount-rules/:id", discountRuleHandler.GetByID)
			staff.PUT("/discount-rules/:id", discountRuleHandler.Update)
			staff.DELETE("/discount-rules/:id", discountRuleHandler.Delete)
			staff.PATCH("/discount-rules/:id/enable", discountRuleHandler.Enable)
			staff.PATCH("/discount-rules/:id/disable", discountRuleHandler.Disable)

			// Inventory & operations
			staff.GET("/inventory", inventoryHandler.List)
			staff.POST("/inventory", inventoryHandler.Create)
			staff.GET("/inventory/alerts", inventoryHandler.Alerts)
			staff.GET("/inventory/recommendations", inventoryHandler.Recommendations)
			staff.GET("/inventory/transactions", inventoryTxHandler.List)
			staff.POST("/inventory/wastage", inventoryHandler.Wastage)
			staff.POST("/inventory/wastage/product", inventoryHandler.ProductWastage)
			staff.POST("/inventory/adjust", inventoryHandler.Adjust)
			staff.POST("/inventory/bulk-save", inventoryHandler.BulkSave)
			staff.GET("/inventory/:id", inventoryHandler.GetByID)
			staff.PUT("/inventory/:id", inventoryHandler.Update)
			staff.DELETE("/inventory/:id", inventoryHandler.Delete)

			staff.GET("/recipes", recipeHandler.List)
			staff.POST("/recipes", recipeHandler.Create)
			staff.PUT("/recipes/set", recipeHandler.ReplaceSet)
			staff.GET("/recipes/product/:productId", recipeHandler.ListByProduct)
			staff.PUT("/recipes/:id", recipeHandler.Update)
			staff.DELETE("/recipes/:id", recipeHandler.Delete)

			staff.GET("/suppliers", supplierHandler.List)
			staff.POST("/suppliers", supplierHandler.Create)
			staff.GET("/suppliers/:id", supplierHandler.GetByID)
			staff.PUT("/suppliers/:id", supplierHandler.Update)
			staff.DELETE("/suppliers/:id", supplierHandler.Delete)

			staff.GET("/purchases", purchaseHandler.List)
			staff.POST("/purchases", purchaseHandler.Create)
			staff.GET("/purchases/:id", purchaseHandler.GetByID)
			staff.PUT("/purchases/:id", purchaseHandler.Update)
			staff.PATCH("/purchases/:id/reverse", purchaseHandler.Reverse)

			staff.GET("/expenses/categories", expenseHandler.Categories)
			staff.GET("/expenses", expenseHandler.List)
			staff.POST("/expenses", expenseHandler.Create)
			staff.GET("/expenses/:id", expenseHandler.GetByID)
			staff.PUT("/expenses/:id", expenseHandler.Update)
			staff.DELETE("/expenses/:id", expenseHandler.Delete)

			staff.GET("/reports/profit-loss", reportHandler.ProfitLoss)

			staff.GET("/orders", orderHandler.List)
			staff.POST("/orders/phone", orderHandler.CreatePhone)
			staff.POST("/orders/walkin", orderHandler.CreateWalkin)
			staff.GET("/orders/pending", orderHandler.ListPending)
			staff.GET("/orders/phone", orderHandler.ListPhone)
			staff.GET("/orders/walkin", orderHandler.ListWalkin)
			staff.GET("/orders/customers/lookup", orderHandler.LookupCustomers)
			staff.GET("/orders/:id", orderHandler.GetByID)
			staff.PUT("/orders/:id", orderHandler.Update)
			staff.DELETE("/orders/:id", orderHandler.Delete)
			staff.PATCH("/orders/:id/cancel", orderHandler.Cancel)
			staff.PATCH("/orders/:id/complete", orderHandler.Complete)

			staff.GET("/payments", paymentHandler.List)
			staff.POST("/payments", paymentHandler.Create)
			staff.GET("/payments/:id", paymentHandler.GetByID)
			staff.PUT("/payments/:id", paymentHandler.Update)
			staff.DELETE("/payments/:id", paymentHandler.Delete)

			staff.GET("/analytics/today-sales", analyticsHandler.TodaySales)
			staff.GET("/analytics/yesterday-sales", analyticsHandler.YesterdaySales)
			staff.GET("/analytics/weekly-sales", analyticsHandler.WeeklySales)
			staff.GET("/analytics/monthly-sales", analyticsHandler.MonthlySales)
			staff.GET("/analytics/sales", analyticsHandler.SalesPeriod)
			staff.GET("/analytics/best-selling-products", analyticsHandler.BestSellingProducts)
			staff.GET("/analytics/cancelled-orders", analyticsHandler.CancelledOrders)
			staff.GET("/analytics/payment-breakdown", analyticsHandler.PaymentBreakdown)
			staff.GET("/analytics/remaining-inventory", analyticsHandler.RemainingInventory)
			staff.GET("/analytics/low-stock", analyticsHandler.LowStockItems)

			staff.GET("/settings", settingHandler.Get)
			staff.PUT("/settings", settingHandler.Update)
			staff.POST("/uploads/image", uploadHandler.Image)
		}
	}

	return router
}
