package service

import (
	"backend/internal/domain"
	"backend/internal/repository"

	"gorm.io/gorm"
)

type AppServices struct {
	Auth                  *AuthService
	Categories            *CRUDService[domain.Category]
	Products              *CRUDService[domain.Product]
	ProductSizes          *CRUDService[domain.ProductSize]
	Catalog               *CatalogService
	Locations             *CRUDService[domain.Location]
	Offers                *OfferService
	DiscountRules         *DiscountRuleService
	Inventory             *InventoryService
	InventoryTransactions *InventoryTransactionService
	Recipes               *RecipeService
	Suppliers             *SupplierService
	Purchases             *PurchaseService
	Expenses              *ExpenseService
	Reports               *ReportService
	Orders                *OrderService
	Payments              *PaymentService
	Analytics             *AnalyticsService
	Settings              *SettingService
}

func NewAppServices(db *gorm.DB, jwtSecret string) *AppServices {
	return &AppServices{
		Auth:                  NewAuthService(db, jwtSecret),
		Categories:            NewCRUDService(repository.NewGenericRepository[domain.Category](db)),
		Products:              NewCRUDService(repository.NewGenericRepository[domain.Product](db)),
		ProductSizes:          NewCRUDService(repository.NewGenericRepository[domain.ProductSize](db)),
		Catalog:               NewCatalogService(db),
		Locations:             NewCRUDService(repository.NewGenericRepository[domain.Location](db)),
		Offers:                NewOfferService(db),
		DiscountRules:         NewDiscountRuleService(db),
		Inventory:             NewInventoryService(db),
		InventoryTransactions: NewInventoryTransactionService(db),
		Recipes:               NewRecipeService(db),
		Suppliers:             NewSupplierService(db),
		Purchases:             NewPurchaseService(db),
		Expenses:              NewExpenseService(db),
		Reports:               NewReportService(db),
		Orders:                NewOrderService(db),
		Payments:              NewPaymentService(db),
		Analytics:             NewAnalyticsService(db),
		Settings:              NewSettingService(db),
	}
}
