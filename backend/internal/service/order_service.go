package service

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"backend/internal/domain"
	"backend/internal/dto"
	"backend/internal/notify"
	"backend/internal/repository"
	"backend/internal/shop"
	"backend/internal/utils"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type OrderService struct {
	db            *gorm.DB
	orderRepo     *repository.OrderRepository
	inventoryRepo *repository.InventoryRepository
	paymentRepo   *repository.PaymentRepository
	discountRules *DiscountRuleService
}

func NewOrderService(db *gorm.DB) *OrderService {
	return &OrderService{
		db:            db,
		orderRepo:     repository.NewOrderRepository(db),
		inventoryRepo: repository.NewInventoryRepository(db),
		paymentRepo:   repository.NewPaymentRepository(db),
		discountRules: NewDiscountRuleService(db),
	}
}

func (s *OrderService) activeDiscount(saleTime time.Time, allSubtotal, nonDealSubtotal int) int {
	rules, err := s.discountRules.ListActive()
	if err != nil || len(rules) == 0 {
		return 0
	}
	return DiscountFromRules(rules, saleTime, allSubtotal, nonDealSubtotal)
}

var phonePattern = regexp.MustCompile(`^[0-9+()[:space:]-]{7,20}$`)

// resolveClientCreatedAt keeps the original till time so a 3-day offline
// backlog is not stamped as "today" when it finally syncs.
func resolveClientCreatedAt(raw *time.Time) time.Time {
	now := time.Now().UTC()
	if raw == nil || raw.IsZero() {
		return now
	}
	t := raw.UTC()
	if t.After(now.Add(5 * time.Minute)) {
		return now
	}
	if now.Sub(t) > 365*24*time.Hour {
		return now
	}
	return t
}

// allocateDailyNumber picks the next 1..N token for a Karachi business day.
// If the POS sends a free hint, that value is kept (offline print match).
func allocateDailyNumber(tx *gorm.DB, businessDate string, hint *int) (int, error) {
	var maxNum int
	if err := tx.Model(&domain.Order{}).
		Where("business_date = ?", businessDate).
		Select("COALESCE(MAX(daily_number), 0)").
		Scan(&maxNum).Error; err != nil {
		return 0, err
	}
	next := maxNum + 1
	if hint != nil && *hint > 0 {
		var taken int64
		if err := tx.Model(&domain.Order{}).
			Where("business_date = ? AND daily_number = ?", businessDate, *hint).
			Count(&taken).Error; err != nil {
			return 0, err
		}
		if taken == 0 {
			return *hint, nil
		}
	}
	return next, nil
}

func (s *OrderService) CreateOrder(
	input dto.CreateOrderRequest,
	orderType string,
	customerID *uuid.UUID,
) (*domain.Order, error) {
	orderType = normalizeOrderType(orderType)
	method := strings.ToLower(strings.TrimSpace(input.PaymentMethod))
	customerName := strings.TrimSpace(input.CustomerName)
	phone := strings.TrimSpace(input.Phone)
	address := strings.TrimSpace(input.Address)

	// Idempotent create: return existing order for the same client_order_id.
	if input.ClientOrderID != nil {
		if existing, err := s.orderRepo.GetByClientOrderID(*input.ClientOrderID); err == nil && existing != nil {
			return existing, nil
		} else if err != nil && err != gorm.ErrRecordNotFound {
			return nil, err
		}
	}

	// Walk-in POS always sends "Walk-in Customer"; keep a safe default if a
	// client omits it so blank names cannot land via /orders/walkin.
	if customerName == "" && orderType == "walkin" {
		customerName = "Walk-in Customer"
	}
	if customerName == "" {
		return nil, utils.NewAppError(http.StatusBadRequest, "customer name is required")
	}
	if !phonePattern.MatchString(phone) {
		return nil, utils.NewAppError(http.StatusBadRequest, "invalid phone number")
	}
	if (orderType == "website" || orderType == "guest" || orderType == "phone") && address == "" {
		return nil, utils.NewAppError(http.StatusBadRequest, "delivery address is required")
	}
	if err := validatePaymentForOrderType(orderType, method); err != nil {
		return nil, err
	}
	if len(input.Items) == 0 {
		return nil, utils.NewAppError(http.StatusBadRequest, "cart cannot be empty")
	}

	locationID := input.LocationID
	if locationID == uuid.Nil && orderType == "walkin" {
		// Deterministic in-store location seeded by importmenu / POS.
		locationID = uuid.MustParse("50000000-0000-4000-8000-000000000000")
	}
	if locationID == uuid.Nil {
		return nil, utils.NewAppError(http.StatusBadRequest, "delivery location is required")
	}

	tx := s.db.Begin()
	if tx.Error != nil {
		return nil, tx.Error
	}

	var location domain.Location
	if err := tx.First(&location, "id = ?", locationID).Error; err != nil {
		tx.Rollback()
		if err == gorm.ErrRecordNotFound {
			return nil, utils.NewAppError(http.StatusBadRequest, "invalid location")
		}
		return nil, err
	}

	if customerID != nil {
		var customer domain.Customer
		if err := tx.First(&customer, "id = ?", *customerID).Error; err != nil {
			tx.Rollback()
			return nil, utils.NewAppError(http.StatusUnauthorized, "customer account not found")
		}
	}

	var setting domain.Setting
	_ = tx.Order("created_at asc").First(&setting).Error
	codFee := 0
	if method == "cod" {
		codFee = setting.CashOnDeliveryFee
	}

	saleTime := resolveClientCreatedAt(input.CreatedAt)
	orderID := uuid.New()
	prefix := shop.Current().OrderPrefix

	businessDate := utils.BusinessDateYMD(saleTime)
	if input.BusinessDate != nil {
		hint := strings.TrimSpace(*input.BusinessDate)
		if len(hint) == 10 {
			businessDate = hint
		}
	}
	dailyNumber, err := allocateDailyNumber(tx, businessDate, input.DailyNumber)
	if err != nil {
		tx.Rollback()
		return nil, err
	}
	// Unique public code (DB unique) while receipts show DailyNumber only.
	orderNumber := fmt.Sprintf("%s-%s-%d", prefix, strings.ReplaceAll(businessDate, "-", ""), dailyNumber)

	order := &domain.Order{
		BaseModel:         domain.BaseModel{ID: orderID, CreatedAt: saleTime, UpdatedAt: time.Now().UTC()},
		OrderNumber:       orderNumber,
		BusinessDate:      businessDate,
		DailyNumber:       dailyNumber,
		ClientOrderID:     input.ClientOrderID,
		CustomerID:        customerID,
		CustomerName:      customerName,
		Phone:             phone,
		Address:           address,
		LocationID:        locationID,
		DeliveryCharge:    location.DeliveryCharge,
		CashOnDeliveryFee: codFee,
		PaymentMethod:     method,
		OrderStatus:       "PENDING",
		OrderType:         orderType,
		OrderNotes:        input.OrderNotes,
	}

	subtotal := 0
	eligibleSubtotal := 0
	order.Items = make([]domain.OrderItem, 0, len(input.Items))

	sizeIDs := make([]uuid.UUID, 0, len(input.Items))
	productIDs := make([]uuid.UUID, 0, len(input.Items))
	for _, item := range input.Items {
		sizeIDs = append(sizeIDs, item.ProductSizeID)
		productIDs = append(productIDs, item.ProductID)
	}
	sizesByID, productsByID, err := loadCatalogMaps(tx, sizeIDs, productIDs)
	if err != nil {
		tx.Rollback()
		return nil, err
	}

	for _, item := range input.Items {
		size, ok := sizesByID[item.ProductSizeID]
		if !ok {
			tx.Rollback()
			return nil, utils.NewAppError(http.StatusBadRequest, "invalid product size")
		}
		if size.ProductID != item.ProductID {
			tx.Rollback()
			return nil, utils.NewAppError(http.StatusBadRequest, "product size does not belong to product")
		}
		product, ok := productsByID[item.ProductID]
		if !ok {
			tx.Rollback()
			return nil, utils.NewAppError(http.StatusBadRequest, "invalid product")
		}
		if !product.Available {
			tx.Rollback()
			return nil, utils.NewAppError(http.StatusBadRequest, "product is unavailable: "+product.Name)
		}

		unitPrice, err := resolveLinePrice(orderType, product, size, item.Price)
		if err != nil {
			tx.Rollback()
			return nil, err
		}

		lineTotal := unitPrice * item.Quantity
		subtotal += lineTotal
		if !isDealProduct(product) {
			eligibleSubtotal += lineTotal
		}
		order.Items = append(order.Items, domain.OrderItem{
			ProductID:           item.ProductID,
			ProductSizeID:       item.ProductSizeID,
			Quantity:            item.Quantity,
			Price:               unitPrice,
			SpecialInstructions: strings.TrimSpace(item.SpecialInstructions),
		})
	}

	discount := s.activeDiscount(saleTime, subtotal, eligibleSubtotal)
	order.Subtotal = subtotal
	order.Discount = discount
	order.GrandTotal = subtotal - discount + location.DeliveryCharge + codFee

	if err := s.orderRepo.Create(tx, order); err != nil {
		tx.Rollback()
		// Concurrent duplicate create with same client_order_id → return existing.
		if input.ClientOrderID != nil {
			if existing, lookupErr := s.orderRepo.GetByClientOrderID(*input.ClientOrderID); lookupErr == nil && existing != nil {
				return existing, nil
			}
		}
		return nil, err
	}

	payment := &domain.Payment{
		OrderID:   order.ID,
		Method:    method,
		Amount:    order.GrandTotal,
		Status:    "pending",
		Reference: "",
	}
	if err := s.paymentRepo.Create(tx, payment); err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	// WhatsApp alert only for customer website orders (not POS walk-in / phone).
	if orderType == "website" || orderType == "guest" {
		items := make([]notify.OrderAlertItem, 0, len(order.Items))
		for _, it := range order.Items {
			name := "Item"
			if p, ok := productsByID[it.ProductID]; ok && strings.TrimSpace(p.Name) != "" {
				name = p.Name
			}
			sizeLabel := ""
			if sz, ok := sizesByID[it.ProductSizeID]; ok {
				sizeLabel = sz.Size
			}
			items = append(items, notify.OrderAlertItem{
				Name:         name,
				Size:         sizeLabel,
				Quantity:     it.Quantity,
				LineTotal:    it.Price * it.Quantity,
				Instructions: it.SpecialInstructions,
			})
		}
		notify.NotifyWebsiteOrderAsync(notify.OrderAlert{
			OrderID:       order.ID,
			OrderNumber:   order.OrderNumber,
			CustomerName:  order.CustomerName,
			Phone:         order.Phone,
			Address:       order.Address,
			LocationName:  location.Name,
			PaymentMethod: order.PaymentMethod,
			OrderNotes:    order.OrderNotes,
			Subtotal:      order.Subtotal,
			Discount:      order.Discount,
			Delivery:      order.DeliveryCharge,
			CODFee:        order.CashOnDeliveryFee,
			GrandTotal:    order.GrandTotal,
			Items:         items,
		})
	}

	return s.orderRepo.GetByID(order.ID)
}

func (s *OrderService) UpdateOrder(id uuid.UUID, input dto.UpdateOrderRequest) error {
	if input.OrderStatus != nil {
		status := strings.ToUpper(*input.OrderStatus)
		switch status {
		case "COMPLETED":
			return s.CompleteOrder(id)
		case "CANCELLED":
			return s.CancelOrder(id)
		case "PENDING":
			// fall through — allow metadata/item edits while keeping PENDING
		default:
			return utils.NewAppError(http.StatusBadRequest, "invalid order status")
		}
	}

	updates := map[string]any{}
	if input.CustomerName != nil {
		// Same rule as CreateOrder: never persist blank/whitespace names
		// (admin edit previously could clear a walk-in ticket to "").
		name := strings.TrimSpace(*input.CustomerName)
		if name == "" {
			return utils.NewAppError(http.StatusBadRequest, "customer name is required")
		}
		updates["customer_name"] = name
	}
	if input.Phone != nil {
		updates["phone"] = *input.Phone
	}
	if input.Address != nil {
		updates["address"] = *input.Address
	}
	if input.LocationID != nil {
		updates["location_id"] = *input.LocationID
	}
	if input.PaymentMethod != nil {
		updates["payment_method"] = strings.ToLower(*input.PaymentMethod)
	}
	if input.OrderNotes != nil {
		updates["order_notes"] = *input.OrderNotes
	}
	if input.OrderStatus != nil {
		updates["order_status"] = strings.ToUpper(*input.OrderStatus)
	}
	if len(updates) == 0 && input.Items == nil {
		return utils.NewAppError(http.StatusBadRequest, "no fields to update")
	}

	tx := s.db.Begin()
	if tx.Error != nil {
		return tx.Error
	}
	current, err := s.orderRepo.GetByIDTx(tx, id)
	if err != nil {
		tx.Rollback()
		return err
	}

	var setting domain.Setting
	_ = tx.Order("created_at asc").First(&setting).Error

	if current.OrderStatus == "PENDING" {
		// normal edits
	} else if current.OrderStatus == "COMPLETED" && setting.PosAllowHistoryEdit {
		// POS history edit: allow item/metadata changes on completed tickets
	} else {
		tx.Rollback()
		return utils.NewAppError(http.StatusConflict, "only pending orders can be edited")
	}

	locationID := current.LocationID
	if input.LocationID != nil {
		locationID = *input.LocationID
	}
	method := current.PaymentMethod
	if input.PaymentMethod != nil {
		method = strings.ToLower(*input.PaymentMethod)
	}
	if err := validatePaymentForOrderType(current.OrderType, method); err != nil {
		tx.Rollback()
		return err
	}

	var location domain.Location
	if err := tx.First(&location, "id = ?", locationID).Error; err != nil {
		tx.Rollback()
		if err == gorm.ErrRecordNotFound {
			return utils.NewAppError(http.StatusBadRequest, "invalid location")
		}
		return err
	}

	codFee := 0
	if method == "cod" {
		codFee = setting.CashOnDeliveryFee
	}
	updates["delivery_charge"] = location.DeliveryCharge
	updates["cash_on_delivery_fee"] = codFee

	if input.Items != nil {
		if len(*input.Items) == 0 {
			tx.Rollback()
			return utils.NewAppError(http.StatusBadRequest, "cart cannot be empty")
		}
		subtotal := 0
		eligibleSubtotal := 0
		newItems := make([]domain.OrderItem, 0, len(*input.Items))
		sizeIDs := make([]uuid.UUID, 0, len(*input.Items))
		productIDs := make([]uuid.UUID, 0, len(*input.Items))
		for _, item := range *input.Items {
			sizeIDs = append(sizeIDs, item.ProductSizeID)
			productIDs = append(productIDs, item.ProductID)
		}
		sizesByID, productsByID, err := loadCatalogMaps(tx, sizeIDs, productIDs)
		if err != nil {
			tx.Rollback()
			return err
		}
		for _, item := range *input.Items {
			size, ok := sizesByID[item.ProductSizeID]
			if !ok {
				tx.Rollback()
				return utils.NewAppError(http.StatusBadRequest, "invalid product size")
			}
			if size.ProductID != item.ProductID {
				tx.Rollback()
				return utils.NewAppError(http.StatusBadRequest, "product size does not belong to product")
			}
			product, ok := productsByID[item.ProductID]
			if !ok {
				tx.Rollback()
				return utils.NewAppError(http.StatusBadRequest, "invalid product")
			}
			if !product.Available {
				tx.Rollback()
				return utils.NewAppError(http.StatusBadRequest, "product is unavailable: "+product.Name)
			}
			unitPrice, err := resolveLinePrice(current.OrderType, product, size, item.Price)
			if err != nil {
				tx.Rollback()
				return err
			}
			lineTotal := unitPrice * item.Quantity
			subtotal += lineTotal
			if !isDealProduct(product) {
				eligibleSubtotal += lineTotal
			}
			newItems = append(newItems, domain.OrderItem{
				ProductID:           item.ProductID,
				ProductSizeID:       item.ProductSizeID,
				Quantity:            item.Quantity,
				Price:               unitPrice,
				SpecialInstructions: strings.TrimSpace(item.SpecialInstructions),
			})
		}
		discount := s.activeDiscount(current.CreatedAt, subtotal, eligibleSubtotal)
		updates["subtotal"] = subtotal
		updates["discount"] = discount
		updates["grand_total"] = subtotal - discount + location.DeliveryCharge + codFee
		if err := s.orderRepo.ReplaceItems(tx, id, newItems); err != nil {
			tx.Rollback()
			return err
		}
	} else {
		discount := current.Discount
		updates["grand_total"] = current.Subtotal - discount + location.DeliveryCharge + codFee
	}

	if err := s.orderRepo.Update(tx, id, updates); err != nil {
		tx.Rollback()
		return err
	}

	if payment, err := s.paymentRepo.GetByOrderID(id); err == nil {
		_ = tx.Model(&domain.Payment{}).Where("id = ?", payment.ID).Updates(map[string]any{
			"method": method,
			"amount": updates["grand_total"],
		})
	}

	return tx.Commit().Error
}

func (s *OrderService) CancelOrder(id uuid.UUID) error {
	tx := s.db.Begin()
	if tx.Error != nil {
		return tx.Error
	}

	order, err := s.orderRepo.GetByIDTx(tx, id)
	if err != nil {
		tx.Rollback()
		return err
	}
	if order.OrderStatus == "CANCELLED" {
		tx.Rollback()
		return nil
	}
	if order.OrderStatus == "COMPLETED" {
		tx.Rollback()
		return utils.NewAppError(http.StatusConflict, "completed orders cannot be cancelled")
	}

	affected, err := s.orderRepo.TransitionStatus(tx, id, "PENDING", "CANCELLED")
	if err != nil {
		tx.Rollback()
		return err
	}
	if affected == 0 {
		tx.Rollback()
		return utils.NewAppError(http.StatusConflict, "order could not be cancelled")
	}

	_ = tx.Model(&domain.Payment{}).
		Where("order_id = ?", id).
		Update("status", "failed")

	return tx.Commit().Error
}

func (s *OrderService) CompleteOrder(id uuid.UUID) error {
	tx := s.db.Begin()
	if tx.Error != nil {
		return tx.Error
	}

	order, err := s.orderRepo.GetByIDTx(tx, id)
	if err != nil {
		tx.Rollback()
		return err
	}
	if order.OrderStatus == "COMPLETED" {
		tx.Rollback()
		return nil // idempotent
	}
	if order.OrderStatus == "CANCELLED" {
		tx.Rollback()
		return utils.NewAppError(http.StatusConflict, "cancelled orders cannot be completed")
	}

	affected, err := s.orderRepo.TransitionStatus(tx, id, "PENDING", "COMPLETED")
	if err != nil {
		tx.Rollback()
		return err
	}
	if affected == 0 {
		tx.Rollback()
		return utils.NewAppError(http.StatusConflict, "order already processed")
	}

	// Avoid a second full Preload — status is known after a successful transition.
	order.OrderStatus = "COMPLETED"

	if err := s.consumeInventory(tx, order); err != nil {
		tx.Rollback()
		return err
	}

	if payment, err := s.paymentRepo.GetByOrderID(id); err == nil {
		_ = tx.Model(&domain.Payment{}).Where("id = ?", payment.ID).Updates(map[string]any{
			"status": "paid",
			"amount": order.GrandTotal,
		}).Error
	}

	return tx.Commit().Error
}

func (s *OrderService) DeleteOrder(id uuid.UUID) error {
	tx := s.db.Begin()
	if tx.Error != nil {
		return tx.Error
	}

	order, err := s.orderRepo.GetByIDTx(tx, id)
	if err != nil {
		tx.Rollback()
		return err
	}
	if order.OrderStatus == "COMPLETED" {
		tx.Rollback()
		return utils.NewAppError(http.StatusConflict, "completed orders cannot be deleted")
	}

	if err := tx.Where("order_id = ?", id).Delete(&domain.OrderItem{}).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Where("order_id = ?", id).Delete(&domain.Payment{}).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := s.orderRepo.Delete(tx, id); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit().Error
}

func (s *OrderService) ListOrders(f repository.OrderListFilter) ([]domain.Order, int64, error) {
	return s.orderRepo.ListPaged(f)
}

func (s *OrderService) ListCustomerOrders(customerID uuid.UUID, limit int) ([]domain.Order, error) {
	return s.orderRepo.ListByCustomerID(customerID, limit)
}

func (s *OrderService) ListPendingOrders() ([]domain.Order, error) {
	return s.orderRepo.ListByStatus("PENDING")
}

func (s *OrderService) ListOrdersByType(orderType string) ([]domain.Order, error) {
	return s.orderRepo.ListByType(normalizeOrderType(orderType))
}

func (s *OrderService) LookupCustomersByPhone(q string) ([]dto.CustomerLookupResult, error) {
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, q)
	if strings.HasPrefix(digits, "92") && len(digits) >= 12 {
		digits = "0" + digits[2:]
	} else if len(digits) == 10 && strings.HasPrefix(digits, "3") {
		digits = "0" + digits
	}
	if len(digits) > 11 {
		digits = digits[:11]
	}
	if len(digits) < 4 {
		return []dto.CustomerLookupResult{}, nil
	}

	rows, err := s.orderRepo.ListForCustomerLookup(digits, 250)
	if err != nil {
		return nil, err
	}

	type agg struct {
		result dto.CustomerLookupResult
		count  int
	}
	byPhone := make(map[string]*agg)
	orderKeys := make([]string, 0)

	for _, row := range rows {
		phone := strings.Map(func(r rune) rune {
			if r >= '0' && r <= '9' {
				return r
			}
			return -1
		}, row.Phone)
		if strings.HasPrefix(phone, "92") && len(phone) >= 12 {
			phone = "0" + phone[2:]
		} else if len(phone) == 10 && strings.HasPrefix(phone, "3") {
			phone = "0" + phone
		}
		if len(phone) > 11 {
			phone = phone[:11]
		}
		if phone == "" || phone == "0000000000" || !strings.HasPrefix(phone, digits) {
			continue
		}

		existing, ok := byPhone[phone]
		if !ok {
			var locID *string
			if row.LocationID != nil {
				s := row.LocationID.String()
				locID = &s
			}
			byPhone[phone] = &agg{
				result: dto.CustomerLookupResult{
					Phone:       phone,
					Name:        strings.TrimSpace(row.CustomerName),
					Address:     strings.TrimSpace(row.Address),
					LocationID:  locID,
					LastOrderAt: row.CreatedAt.UTC().Format(time.RFC3339),
					OrderCount:  1,
				},
				count: 1,
			}
			orderKeys = append(orderKeys, phone)
			continue
		}
		existing.count++
		existing.result.OrderCount = existing.count
		// rows are newest-first; first entry already has latest name/address
	}

	out := make([]dto.CustomerLookupResult, 0, len(orderKeys))
	for _, phone := range orderKeys {
		if a := byPhone[phone]; a != nil {
			if a.result.Name == "" {
				a.result.Name = "Customer"
			}
			out = append(out, a.result)
		}
		if len(out) >= 15 {
			break
		}
	}
	return out, nil
}

func (s *OrderService) GetOrderByID(id uuid.UUID) (*domain.Order, error) {
	return s.orderRepo.GetByID(id)
}

// consumeInventory deducts recipe ingredients when an order is completed.
//
// Design rules for a live restaurant counter:
//   - Only COMPLETED orders consume stock (PENDING never does).
//   - Recipes are size-aware: a Large pizza uses more than a Small one.
//   - Products without recipes (drinks without BOM, new items) simply skip.
//   - Stock is allowed to go negative so a sale is never blocked mid-service;
//     negative balances surface as dashboard alerts for the owner to reconcile.
func (s *OrderService) consumeInventory(tx *gorm.DB, order *domain.Order) error {
	orderID := order.ID
	reason := fmt.Sprintf("Order %s completed", order.OrderNumber)
	if order.OrderNumber == "" {
		reason = fmt.Sprintf("Order %s completed", order.ID.String())
	}

	productIDs := make([]uuid.UUID, 0, len(order.Items))
	for _, item := range order.Items {
		productIDs = append(productIDs, item.ProductID)
	}
	recipesByProduct, err := s.inventoryRepo.RecipeLinesForProducts(tx, productIDs)
	if err != nil {
		return err
	}

	for _, item := range order.Items {
		recipes := pickRecipeLines(recipesByProduct[item.ProductID], item.ProductSizeID)
		for _, recipe := range recipes {
			consumeQty := recipe.QuantityRequired * int64(item.Quantity)
			if consumeQty <= 0 {
				continue
			}
			if _, err := s.inventoryRepo.ApplyMovement(tx, repository.Movement{
				InventoryID:   recipe.InventoryID,
				QuantityBase:  -consumeQty,
				Type:          domain.StockConsumption,
				Reason:        reason,
				ReferenceType: domain.RefOrder,
				ReferenceID:   &orderID,
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

func loadCatalogMaps(
	tx *gorm.DB,
	sizeIDs, productIDs []uuid.UUID,
) (map[uuid.UUID]domain.ProductSize, map[uuid.UUID]domain.Product, error) {
	sizesByID := make(map[uuid.UUID]domain.ProductSize, len(sizeIDs))
	productsByID := make(map[uuid.UUID]domain.Product, len(productIDs))
	if len(sizeIDs) > 0 {
		var sizes []domain.ProductSize
		if err := tx.Where("id IN ?", sizeIDs).Find(&sizes).Error; err != nil {
			return nil, nil, err
		}
		for _, size := range sizes {
			sizesByID[size.ID] = size
		}
	}
	if len(productIDs) > 0 {
		var products []domain.Product
		if err := tx.Preload("Category").Where("id IN ?", productIDs).Find(&products).Error; err != nil {
			return nil, nil, err
		}
		for _, product := range products {
			productsByID[product.ID] = product
		}
	}
	return sizesByID, productsByID, nil
}

func pickRecipeLines(all []domain.Recipe, sizeID uuid.UUID) []domain.Recipe {
	if len(all) == 0 {
		return nil
	}
	sized := make([]domain.Recipe, 0, len(all))
	generic := make([]domain.Recipe, 0, len(all))
	for _, r := range all {
		if r.ProductSizeID != nil && *r.ProductSizeID == sizeID {
			sized = append(sized, r)
		} else if r.ProductSizeID == nil {
			generic = append(generic, r)
		}
	}
	if len(sized) > 0 {
		return sized
	}
	return generic
}

func validatePaymentForOrderType(orderType, method string) error {
	switch orderType {
	case "walkin":
		switch method {
		case "cash", "easypaisa", "jazzcash":
			return nil
		default:
			return utils.NewAppError(http.StatusBadRequest, "walk-in orders only support cash, easypaisa, or jazzcash")
		}
	case "phone", "website", "guest":
		switch method {
		case "easypaisa", "jazzcash", "card", "bank", "cod":
			return nil
		default:
			return utils.NewAppError(http.StatusBadRequest, "delivery orders cannot use in-store cash payment")
		}
	default:
		return nil
	}
}

func normalizeOrderType(orderType string) string {
	switch strings.ToLower(strings.TrimSpace(orderType)) {
	case "phone":
		return "phone"
	case "walkin", "walk-in":
		return "walkin"
	case "guest":
		return "guest"
	default:
		return "website"
	}
}

func resolveLinePrice(
	orderType string,
	product domain.Product,
	size domain.ProductSize,
	clientPrice *int,
) (int, error) {
	staffOrder := orderType == "walkin" || orderType == "phone"
	if staffOrder && product.AllowManualPrice && clientPrice != nil && *clientPrice > 0 {
		return *clientPrice, nil
	}
	return size.Price, nil
}

func ParseOrderID(id string) (uuid.UUID, error) {
	parsed, err := uuid.Parse(id)
	if err != nil {
		return uuid.Nil, utils.NewAppError(http.StatusBadRequest, "invalid order id")
	}
	return parsed, nil
}
