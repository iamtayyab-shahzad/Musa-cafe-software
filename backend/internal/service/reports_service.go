package service

import (
	"time"

	"backend/internal/domain"
	"backend/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ReportService struct {
	db           *gorm.DB
	inventory    *repository.InventoryRepository
	expenses     *ExpenseService
}

func NewReportService(db *gorm.DB) *ReportService {
	return &ReportService{
		db:        db,
		inventory: repository.NewInventoryRepository(db),
		expenses:  NewExpenseService(db),
	}
}

// ProfitLoss is the owner-facing P&L for a date window.
type ProfitLoss struct {
	Start            time.Time       `json:"start"`
	End              time.Time       `json:"end"`
	Revenue          int             `json:"revenue"`
	CompletedOrders  int64           `json:"completed_orders"`
	CancelledOrders  int64           `json:"cancelled_orders"`
	COGS             int             `json:"cogs"`
	GrossProfit      int             `json:"gross_profit"`
	Expenses         int             `json:"expenses"`
	WastageCost      int             `json:"wastage_cost"`
	NetProfit        int             `json:"net_profit"`
	FoodCostPercent  float64         `json:"food_cost_percent"`
	InventoryValue   int             `json:"inventory_value"`
	PurchasesSpend   int             `json:"purchases_spend"`
	FoodCostSource   string          `json:"food_cost_source"` // cogs | purchases | none
	PeriodDays       int             `json:"period_days"`
	ElapsedDays      int             `json:"elapsed_days"`
	PeriodComplete   bool            `json:"period_complete"`
	AvgDailyRevenue  int             `json:"avg_daily_revenue"`
	AvgDailyExpenses int             `json:"avg_daily_expenses"`
	AvgDailyProfit   int             `json:"avg_daily_profit"`
	BestSelling      []ProductPerf   `json:"best_selling"`
	LeastSelling     []ProductPerf   `json:"least_selling"`
	MostProfitable   []ProductPerf   `json:"most_profitable"`
	LeastProfitable  []ProductPerf   `json:"least_profitable"`
	ExpenseBreakdown []ExpenseBucket `json:"expense_breakdown"`
}

type ProductPerf struct {
	ProductID   string  `json:"product_id"`
	ProductName string  `json:"product_name"`
	Quantity    int     `json:"quantity"`
	Revenue     int     `json:"revenue"`
	Cost        int     `json:"cost"`
	Profit      int     `json:"profit"`
	MarginPct   float64 `json:"margin_pct"`
}

type ExpenseBucket struct {
	Category string `json:"category"`
	Total    int    `json:"total"`
}

// ProfitLossBetween builds the full P&L for [start, end).
func (s *ReportService) ProfitLossBetween(start, end time.Time) (*ProfitLoss, error) {
	pl := &ProfitLoss{Start: start, End: end}

	type orderAgg struct {
		Revenue         int
		CompletedOrders int64
		CancelledOrders int64
	}
	var agg orderAgg
	if err := s.db.Model(&domain.Order{}).
		Select(`
			COALESCE(SUM(CASE WHEN order_status = 'COMPLETED' THEN grand_total ELSE 0 END), 0) as revenue,
			COUNT(*) FILTER (WHERE order_status = 'COMPLETED') as completed_orders,
			COUNT(*) FILTER (WHERE order_status = 'CANCELLED') as cancelled_orders
		`).
		Where("created_at >= ? AND created_at < ?", start, end).
		Scan(&agg).Error; err != nil {
		return nil, err
	}
	pl.Revenue = agg.Revenue
	pl.CompletedOrders = agg.CompletedOrders
	pl.CancelledOrders = agg.CancelledOrders

	// Without recipe BOMs / stock tracking, food cost stays unused.
	// Owner logs stock buys as Expenses (MONTHLY salaries prorate automatically).
	pl.COGS = 0
	pl.FoodCostSource = "none"
	pl.GrossProfit = pl.Revenue

	pl.WastageCost = 0

	expenses, err := s.expenses.TotalBetween(start, end)
	if err != nil {
		return nil, err
	}
	pl.Expenses = expenses
	// Simple owner model: Profit = Sales − Expenses (for the selected weeks/months).
	pl.NetProfit = pl.Revenue - pl.Expenses
	pl.FoodCostPercent = 0

	if pl.InventoryValue, err = s.inventory.StockValue(); err != nil {
		return nil, err
	}
	if pl.PurchasesSpend, err = s.inventory.PurchaseCostBetween(start, end); err != nil {
		return nil, err
	}

	fillPeriodAverages(pl, start, end)

	perfs, err := s.productPerformance(start, end)
	if err != nil {
		return nil, err
	}
	pl.BestSelling = topByQty(perfs, true, 10)
	pl.LeastSelling = topByQty(perfs, false, 10)
	pl.MostProfitable = topByProfit(perfs, true, 10)
	pl.LeastProfitable = topByProfit(perfs, false, 10)

	pl.ExpenseBreakdown, err = s.expenseBreakdown(start, end)
	if err != nil {
		return nil, err
	}
	if pl.ExpenseBreakdown == nil {
		pl.ExpenseBreakdown = []ExpenseBucket{}
	}
	if pl.BestSelling == nil {
		pl.BestSelling = []ProductPerf{}
	}
	if pl.LeastSelling == nil {
		pl.LeastSelling = []ProductPerf{}
	}
	if pl.MostProfitable == nil {
		pl.MostProfitable = []ProductPerf{}
	}
	if pl.LeastProfitable == nil {
		pl.LeastProfitable = []ProductPerf{}
	}
	return pl, nil
}

func (s *ReportService) productPerformance(start, end time.Time) ([]ProductPerf, error) {
	// Sales by product + size so COGS can use the same size-aware BOM as orders.
	type saleRow struct {
		ProductID     string
		ProductName   string
		ProductSizeID *string
		Quantity      int
		Revenue       int
	}
	var sales []saleRow
	err := s.db.Table("order_items").
		Select(`order_items.product_id::text as product_id,
			COALESCE(products.name, '') as product_name,
			order_items.product_size_id::text as product_size_id,
			COALESCE(SUM(order_items.quantity), 0) as quantity,
			COALESCE(SUM(order_items.price * order_items.quantity), 0) as revenue`).
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Joins("LEFT JOIN products ON products.id = order_items.product_id").
		Where("orders.order_status = ? AND orders.created_at >= ? AND orders.created_at < ?",
			"COMPLETED", start, end).
		Group("order_items.product_id, products.name, order_items.product_size_id").
		Scan(&sales).Error
	if err != nil {
		return nil, err
	}
	if len(sales) == 0 {
		return []ProductPerf{}, nil
	}

	productIDs := make([]uuid.UUID, 0, len(sales))
	seen := map[string]bool{}
	for _, r := range sales {
		if seen[r.ProductID] {
			continue
		}
		seen[r.ProductID] = true
		if id, err := uuid.Parse(r.ProductID); err == nil {
			productIDs = append(productIDs, id)
		}
	}

	recipesByProduct, err := s.inventory.RecipeLinesForProducts(s.db, productIDs)
	if err != nil {
		return nil, err
	}

	// Ingredient avg costs for recipe valuation.
	invIDs := map[uuid.UUID]struct{}{}
	for _, lines := range recipesByProduct {
		for _, line := range lines {
			invIDs[line.InventoryID] = struct{}{}
		}
	}
	costByInv := map[uuid.UUID]int64{}
	if len(invIDs) > 0 {
		ids := make([]uuid.UUID, 0, len(invIDs))
		for id := range invIDs {
			ids = append(ids, id)
		}
		var invs []domain.Inventory
		if err := s.db.Select("id", "avg_cost_micros").Where("id IN ?", ids).Find(&invs).Error; err != nil {
			return nil, err
		}
		for _, inv := range invs {
			costByInv[inv.ID] = inv.AvgCostMicros
		}
	}

	type agg struct {
		name     string
		quantity int
		revenue  int
		cost     int
	}
	byProduct := map[string]*agg{}
	for _, sale := range sales {
		pid, err := uuid.Parse(sale.ProductID)
		if err != nil {
			continue
		}
		sizeID := uuid.Nil
		if sale.ProductSizeID != nil && *sale.ProductSizeID != "" {
			if parsed, err := uuid.Parse(*sale.ProductSizeID); err == nil {
				sizeID = parsed
			}
		}
		recipes := pickRecipeLines(recipesByProduct[pid], sizeID)
		var unitMicros int64
		for _, recipe := range recipes {
			unitMicros += recipe.QuantityRequired * costByInv[recipe.InventoryID]
		}
		lineCost := domain.ValueFromMicros(unitMicros, int64(sale.Quantity))

		a := byProduct[sale.ProductID]
		if a == nil {
			a = &agg{name: sale.ProductName}
			byProduct[sale.ProductID] = a
		}
		a.quantity += sale.Quantity
		a.revenue += sale.Revenue
		a.cost += lineCost
	}

	out := make([]ProductPerf, 0, len(byProduct))
	for id, a := range byProduct {
		profit := a.revenue - a.cost
		margin := 0.0
		if a.revenue > 0 {
			margin = (float64(profit) / float64(a.revenue)) * 100
		}
		out = append(out, ProductPerf{
			ProductID:   id,
			ProductName: a.name,
			Quantity:    a.quantity,
			Revenue:     a.revenue,
			Cost:        a.cost,
			Profit:      profit,
			MarginPct:   margin,
		})
	}
	return out, nil
}

func (s *ReportService) expenseBreakdown(start, end time.Time) ([]ExpenseBucket, error) {
	rows, err := s.expenses.ListForAllocation(start, end)
	if err != nil {
		return nil, err
	}
	out := BreakdownAllocatedExpenses(rows, start, end)
	// Sort by total desc for stable owner-facing charts.
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].Total > out[i].Total {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out, nil
}

func fillPeriodAverages(pl *ProfitLoss, start, end time.Time) {
	loc := start.Location()
	now := time.Now().In(loc)
	periodStart := dateOnly(start, loc)
	periodEnd := dateOnly(end, loc)
	if end.After(periodEnd) {
		periodEnd = periodEnd.AddDate(0, 0, 1)
	}
	pl.PeriodDays = calendarDays(periodStart, periodEnd)
	pl.PeriodComplete = !now.Before(periodEnd)

	elapsedEnd := periodEnd
	if !pl.PeriodComplete {
		tomorrow := dateOnly(now, loc).AddDate(0, 0, 1)
		if tomorrow.Before(elapsedEnd) {
			elapsedEnd = tomorrow
		}
		if !elapsedEnd.After(periodStart) {
			elapsedEnd = periodStart.AddDate(0, 0, 1)
		}
	}
	pl.ElapsedDays = calendarDays(periodStart, elapsedEnd)
	if pl.ElapsedDays < 1 {
		pl.ElapsedDays = 1
	}
	d := pl.ElapsedDays
	pl.AvgDailyRevenue = pl.Revenue / d
	pl.AvgDailyExpenses = pl.Expenses / d
	pl.AvgDailyProfit = pl.NetProfit / d
}

func topByQty(rows []ProductPerf, desc bool, n int) []ProductPerf {
	cp := append([]ProductPerf{}, rows...)
	for i := 0; i < len(cp); i++ {
		for j := i + 1; j < len(cp); j++ {
			if (desc && cp[j].Quantity > cp[i].Quantity) || (!desc && cp[j].Quantity < cp[i].Quantity) {
				cp[i], cp[j] = cp[j], cp[i]
			}
		}
	}
	if len(cp) > n {
		cp = cp[:n]
	}
	return cp
}

func topByProfit(rows []ProductPerf, desc bool, n int) []ProductPerf {
	cp := append([]ProductPerf{}, rows...)
	for i := 0; i < len(cp); i++ {
		for j := i + 1; j < len(cp); j++ {
			if (desc && cp[j].Profit > cp[i].Profit) || (!desc && cp[j].Profit < cp[i].Profit) {
				cp[i], cp[j] = cp[j], cp[i]
			}
		}
	}
	if len(cp) > n {
		cp = cp[:n]
	}
	return cp
}
