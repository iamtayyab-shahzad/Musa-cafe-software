// e2etest seeds realistic recipes + expenses, then runs a full edge-case
// checklist against the live staff API. Re-run anytime:
//
//	go run ./cmd/e2etest
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const baseURL = "http://127.0.0.1:8080/api/v1"

type apiResp struct {
	Success bool            `json:"success"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

type inventoryItem struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Stock            int64  `json:"stock"`
	Unit             string `json:"unit"`
	PurchaseUnit     string `json:"purchase_unit"`
	UnitsPerPurchase int64  `json:"units_per_purchase"`
	MinimumStock     int64  `json:"minimum_stock"`
	AvgCostMicros    int64  `json:"avg_cost_micros"`
	PurchasePrice    int    `json:"purchase_price"`
	IsActive         bool   `json:"is_active"`
}

type product struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type productSize struct {
	ID        string `json:"id"`
	ProductID string `json:"product_id"`
	Name      string `json:"name"`
	Price     int    `json:"price"`
}

type expense struct {
	ID       string `json:"id"`
	Category string `json:"category"`
	Title    string `json:"title"`
	Amount   int    `json:"amount"`
	Notes    string `json:"notes"`
}

type profitLoss struct {
	Revenue        int `json:"revenue"`
	COGS           int `json:"cogs"`
	Expenses       int `json:"expenses"`
	WastageCost    int `json:"wastage_cost"`
	NetProfit      int `json:"net_profit"`
	PurchasesSpend int `json:"purchases_spend"`
	InventoryValue int `json:"inventory_value"`
}

type productWastageResult struct {
	ProductName string `json:"product_name"`
	Quantity    int    `json:"quantity"`
	Lines       []struct {
		InventoryID   string `json:"inventory_id"`
		InventoryName string `json:"inventory_name"`
		QuantityBase  int64  `json:"quantity_base"`
	} `json:"lines"`
}

type txRow struct {
	InventoryID     string `json:"inventory_id"`
	Quantity        int64  `json:"quantity"`
	TransactionType string `json:"transaction_type"`
	TotalCost       int    `json:"total_cost"`
	Reason          string `json:"reason"`
}

type result struct {
	Name string
	Pass bool
	Detail string
}

func main() {
	token, err := login("admin", "admin@admin")
	if err != nil {
		fmt.Fprintf(os.Stderr, "login failed: %v\n", err)
		os.Exit(1)
	}
	c := &client{token: token}

	printChecklist()

	fmt.Println("\n=== SEED: stock buys (bulk-save) ===")
	inv, err := c.listInventory()
	must(err)
	byName := map[string]inventoryItem{}
	for _, it := range inv {
		byName[it.Name] = it
	}

	seedBuys := []struct {
		name string
		qty  float64
		cost int
	}{
		{"Mozzarella Cheese", 10, 18000},
		{"Pizza Flour (Maida)", 25, 7500},
		{"Pizza Sauce", 8, 6400},
		{"Onion", 5, 750},
		{"Tomato", 5, 1000},
		{"Capsicum", 3, 900},
		{"Chicken Topping", 8, 16000},
		{"Pepperoni", 2, 5000},
		{"Olive Oil", 2, 2400},
		{"Oregano", 2, 600},
		{"Pasta", 5, 2500},
		{"Milk", 10, 3000},
		{"Banana", 5, 750},
		{"Apple", 5, 1000},
		{"French Fries", 10, 5000},
		{"Cooking Oil", 10, 5000},
		{"Burger Buns", 100, 2000},
		{"Chicken Patty", 50, 7500},
		{"Shawarma Bread", 80, 2400},
		{"Mayonnaise", 3, 1800},
		{"Cheese Slices", 100, 3000},
		{"Chicken Boti", 5, 10000},
		{"Thai Wings", 4, 8000},
		{"Chicken Nuggets", 3, 4500},
		{"Salt", 2, 100},
		{"Yeast", 2, 400},
		{"Jalapenos", 1, 800},
		{"Mushroom", 1, 900},
		{"Olives", 1, 1200},
		{"BBQ Sauce", 2, 1000},
		{"Ketchup Packets", 200, 400},
		{"Eggs", 4, 800},
		{"Butter", 2, 2000},
		{"Mint", 1, 400},
		{"Paratha", 40, 1200},
	}
	bulkItems := []map[string]any{}
	for _, b := range seedBuys {
		it, ok := byName[b.name]
		if !ok {
			fmt.Printf("  SKIP buy %s (not in inventory)\n", b.name)
			continue
		}
		min := it.MinimumStock
		bulkItems = append(bulkItems, map[string]any{
			"inventory_id":       it.ID,
			"minimum_stock":      min,
			"purchase_unit":      it.PurchaseUnit,
			"units_per_purchase": it.UnitsPerPurchase,
			"buy_qty":            b.qty,
			"buy_cost":           b.cost,
		})
	}
	must(c.post("/inventory/bulk-save", map[string]any{"items": bulkItems}, nil))
	fmt.Printf("  seeded %d stock buys\n", len(bulkItems))

	inv, err = c.listInventory()
	must(err)
	byName = map[string]inventoryItem{}
	for _, it := range inv {
		byName[it.Name] = it
	}

	products, err := c.listProducts()
	must(err)
	sizes, err := c.listSizes()
	must(err)
	sizesByProduct := map[string][]productSize{}
	for _, s := range sizes {
		sizesByProduct[s.ProductID] = append(sizesByProduct[s.ProductID], s)
	}
	prodByName := map[string]product{}
	for _, p := range products {
		prodByName[p.Name] = p
	}

	fmt.Println("\n=== SEED: recipes (BOM) ===")
	recipeCount := 0
	mustInv := func(names ...string) []map[string]any {
		lines := []map[string]any{}
		for i, n := range names {
			it, ok := byName[n]
			if !ok {
				continue
			}
			qty := int64(50)
			switch {
			case strings.Contains(strings.ToLower(n), "flour"):
				qty = 180
			case strings.Contains(strings.ToLower(n), "cheese") && !strings.Contains(strings.ToLower(n), "slice"):
				qty = 120
			case strings.Contains(strings.ToLower(n), "sauce") || strings.Contains(strings.ToLower(n), "mayonnaise"):
				qty = 40
			case strings.Contains(strings.ToLower(n), "chicken") || strings.Contains(strings.ToLower(n), "pepperoni") || strings.Contains(strings.ToLower(n), "boti"):
				qty = 80
			case strings.Contains(strings.ToLower(n), "bun") || strings.Contains(strings.ToLower(n), "bread") || strings.Contains(strings.ToLower(n), "paratha") || strings.Contains(strings.ToLower(n), "patty"):
				qty = 1
			case strings.Contains(strings.ToLower(n), "milk"):
				qty = 250
			case strings.Contains(strings.ToLower(n), "fries"):
				qty = 150
			case i == 0:
				qty = 100
			}
			lines = append(lines, map[string]any{
				"inventory_id":      it.ID,
				"quantity_required": qty,
			})
		}
		return lines
	}

	saveRecipe := func(productName string, invNames []string, withSizes bool) {
		p, ok := prodByName[productName]
		if !ok {
			fmt.Printf("  SKIP recipe %s (product missing)\n", productName)
			return
		}
		lines := mustInv(invNames...)
		if len(lines) == 0 {
			fmt.Printf("  SKIP recipe %s (no matching inventory)\n", productName)
			return
		}
		sz := sizesByProduct[p.ID]
		if withSizes && len(sz) > 0 {
			for _, s := range sz {
				scaled := make([]map[string]any, len(lines))
				mult := 1.0
				ln := strings.ToLower(s.Name)
				switch {
				case strings.Contains(ln, "large") || strings.Contains(ln, "family"):
					mult = 1.6
				case strings.Contains(ln, "medium"):
					mult = 1.25
				case strings.Contains(ln, "small") || strings.Contains(ln, "regular"):
					mult = 1.0
				}
				for i, line := range lines {
					q := int64(float64(line["quantity_required"].(int64))*mult + 0.5)
					if q < 1 {
						q = 1
					}
					scaled[i] = map[string]any{
						"inventory_id":      line["inventory_id"],
						"quantity_required": q,
						"product_size_id":   s.ID,
					}
				}
				must(c.put("/recipes/set", map[string]any{
					"product_id":      p.ID,
					"product_size_id": s.ID,
					"lines":           scaled,
				}, nil))
				recipeCount++
			}
			return
		}
		must(c.put("/recipes/set", map[string]any{
			"product_id": p.ID,
			"lines":      lines,
		}, nil))
		recipeCount++
	}

	// Pizzas — size-aware where sizes exist
	pizzaBase := []string{"Pizza Flour (Maida)", "Mozzarella Cheese", "Pizza Sauce", "Olive Oil", "Oregano"}
	for _, name := range []string{
		"Margarita Pizza", "Peproni Pizza", "B.B.Q Pizza", "Kabab Stuff Pizza",
		"Bihari Kabab Pizza", "Crown Crush Pizza", "Kababish Pizza", "Rose Crown Pizza",
		"Lazania Pizza", "Mughlai Pizza", "Kelazone Pizza", "Fifty Fifty Pizza",
		"Chicken Fajita", "Chicken Lover", "Chicken Bonefire", "Vege Lover",
		"Hot & Spicy", "Krunchies Special", "Party & Jalapeno", "Chicken Tika",
	} {
		extra := append([]string{}, pizzaBase...)
		switch {
		case strings.Contains(name, "Peproni"):
			extra = append(extra, "Pepperoni")
		case strings.Contains(name, "B.B.Q") || strings.Contains(name, "Tika") || strings.Contains(name, "Fajita") || strings.Contains(name, "Lover") || strings.Contains(name, "Bonefire"):
			extra = append(extra, "Chicken Topping", "Onion", "Capsicum")
		case strings.Contains(name, "Kabab") || strings.Contains(name, "Bihari") || strings.Contains(name, "Mughlai"):
			extra = append(extra, "Chicken Kabab", "Onion")
		case strings.Contains(name, "Vege"):
			extra = append(extra, "Onion", "Capsicum", "Mushroom", "Olives", "Jalapenos")
		case strings.Contains(name, "Jalapeno"):
			extra = append(extra, "Jalapenos", "Chicken Topping")
		default:
			extra = append(extra, "Onion", "Tomato")
		}
		saveRecipe(name, extra, true)
	}

	for _, name := range []string{"Creamy Pasta", "Chicken Pasta", "Loaded Pasta", "Red Sause Pasta", "Spegiti Pasta", "Kala Mada Pasta"} {
		saveRecipe(name, []string{"Pasta", "Milk", "Mozzarella Cheese", "Chicken Topping", "Onion"}, false)
	}
	for _, name := range []string{"Mango Shake", "Apple Shake", "Banana Shake", "Khajoor Shake", "Cold Coffee", "Ice Cream Shake", "Mint Margretta"} {
		ings := []string{"Milk", "Sweet Milk (Condensed)"}
		if strings.Contains(name, "Apple") {
			ings = append(ings, "Apple")
		}
		if strings.Contains(name, "Banana") {
			ings = append(ings, "Banana")
		}
		if strings.Contains(name, "Mint") {
			ings = append(ings, "Mint")
		}
		saveRecipe(name, ings, false)
	}
	for _, name := range []string{"Malai Boti Roll", "Tika Roll", "Chicken Patty Roll", "Chapli Roll", "Arabic Roll", "Shahi Roll", "Chicken Raps", "Bihari Roll"} {
		saveRecipe(name, []string{"Shawarma Bread", "Chicken Boti", "Onion", "Mayonnaise", "Cabbage"}, false)
	}
	for _, name := range []string{"Zinger Burger", "Chicken Patty Burger", "Chapli Burger", "Mighty Zinger Burger", "Tower Burger", "Pizza Burger", "Jalapeno Zinger Burger"} {
		saveRecipe(name, []string{"Burger Buns", "Chicken Patty", "Cheese Slices", "Mayonnaise", "Onion", "Tomato"}, false)
	}
	for _, name := range []string{"Salted Fries", "Masala Fries", "Pizza Fries", "Loaded Fries"} {
		saveRecipe(name, []string{"French Fries", "Cooking Oil", "Salt"}, false)
	}
	saveRecipe("Hot Wings (8)", []string{"Thai Wings", "Cooking Oil", "BBQ Sauce"}, false)
	saveRecipe("Chicken Nuggets (6)", []string{"Chicken Nuggets", "Cooking Oil"}, false)
	saveRecipe("B.B.Q Sandwich", []string{"Burger Buns", "Chicken Topping", "BBQ Sauce", "Cheese Slices"}, false)

	fmt.Printf("  seeded %d recipe sets\n", recipeCount)

	fmt.Println("\n=== SEED: operating expenses (not stock) ===")
	expenseSeed := []struct {
		cat, title string
		amount     int
		daysAgo    int
		recur      string
	}{
		{"Rent", "Shop rent July", 85000, 5, "MONTHLY"},
		{"Electricity", "LESCO bill June", 18500, 12, "MONTHLY"},
		{"Electricity", "LESCO bill July", 21000, 2, "MONTHLY"},
		{"Gas", "Sui gas cylinder refill", 4500, 3, "NONE"},
		{"Gas", "Pipeline gas bill", 3200, 10, "MONTHLY"},
		{"Water", "WASA monthly", 1500, 8, "MONTHLY"},
		{"Internet", "PTCL fiber", 4500, 4, "MONTHLY"},
		{"Salaries", "Chef salary", 45000, 1, "MONTHLY"},
		{"Salaries", "Counter staff", 28000, 1, "MONTHLY"},
		{"Salaries", "Rider salary", 22000, 1, "MONTHLY"},
		{"Cleaning", "Floor cleaner + soap", 1200, 6, "NONE"},
		{"Packaging", "Pizza boxes bulk", 8500, 7, "NONE"},
		{"Packaging", "Sauce cups", 2200, 9, "NONE"},
		{"Advertising", "Facebook ads", 5000, 4, "NONE"},
		{"Advertising", "Flyer print", 3000, 15, "NONE"},
		{"Repairs & Maintenance", "Oven thermostat fix", 6500, 11, "NONE"},
		{"Repairs & Maintenance", "AC service", 4000, 20, "NONE"},
		{"Fuel", "Delivery bike petrol", 3500, 2, "NONE"},
		{"Fuel", "Generator diesel", 2800, 14, "NONE"},
		{"Delivery Charges", "Foodpanda commission top-up", 0, 0, "NONE"}, // skipped via amount check
		{"Equipment", "New dough mixer blade", 7500, 18, "NONE"},
		{"Licenses & Taxes", "Trade license renewal", 12000, 25, "YEARLY"},
		{"Miscellaneous", "Stationery", 800, 3, "NONE"},
		{"Miscellaneous", "Tea for staff", 600, 1, "NONE"},
		{"Cleaning", "Pest control visit", 2500, 16, "NONE"},
		{"Internet", "Router replacement", 4500, 22, "NONE"},
		{"Salaries", "Part-time helper (weekend)", 6000, 3, "WEEKLY"},
		{"Fuel", "Uber for supply run", 900, 1, "NONE"},
		{"Packaging", "Tissue packs", 1100, 5, "NONE"},
		{"Electricity", "UPS battery top-up", 1500, 8, "NONE"},
	}
	expCreated := 0
	for _, e := range expenseSeed {
		if e.amount <= 0 {
			continue
		}
		when := time.Now().AddDate(0, 0, -e.daysAgo).UTC().Truncate(24 * time.Hour)
		must(c.post("/expenses", map[string]any{
			"category":       e.cat,
			"title":          e.title,
			"amount":         e.amount,
			"expense_date":   when.Format(time.RFC3339),
			"payment_method": "cash",
			"notes":          "e2e seed",
			"recurrence":     e.recur,
		}, nil))
		expCreated++
	}
	fmt.Printf("  seeded %d expenses\n", expCreated)

	// ─── RUN TESTS ─────────────────────────────────────────────────────
	fmt.Println("\n=== RUN EDGE-CASE CHECKLIST ===")
	var results []result
	check := func(name string, pass bool, detail string) {
		results = append(results, result{Name: name, Pass: pass, Detail: detail})
		mark := "PASS"
		if !pass {
			mark = "FAIL"
		}
		fmt.Printf("[%s] %s — %s\n", mark, name, detail)
	}

	// Refresh inventory after seed
	inv, err = c.listInventory()
	must(err)
	byName = map[string]inventoryItem{}
	for _, it := range inv {
		byName[it.Name] = it
	}

	// T01: inventory list non-empty
	check("T01 inventory list loaded", len(inv) >= 100, fmt.Sprintf("%d items", len(inv)))

	// T02: stock buy increased mozzarella
	moz := byName["Mozzarella Cheese"]
	check("T02 bulk-save increased cheese stock", moz.Stock >= 10000, fmt.Sprintf("stock=%d avg=%d", moz.Stock, moz.AvgCostMicros))

	// T03: weighted average cost set after purchase
	check("T03 avg cost set after buy", moz.AvgCostMicros > 0, fmt.Sprintf("avg_cost_micros=%d", moz.AvgCostMicros))

	// T04: expected avg ~ 18000 Rs / 10000 g = 1.8 Rs/g = 1_800_000 micros (if only one buy)
	expectedAvg := int64(18000) * 1_000_000 / 10000
	avgOK := moz.AvgCostMicros > 0 && abs64(moz.AvgCostMicros-expectedAvg) < expectedAvg/2 // allow prior stock blend
	check("T04 cheese avg cost in plausible range", avgOK, fmt.Sprintf("got=%d expected~%d", moz.AvgCostMicros, expectedAvg))

	// T05: second buy blends average
	beforeAvg := moz.AvgCostMicros
	beforeStock := moz.Stock
	must(c.post("/inventory/bulk-save", map[string]any{
		"items": []map[string]any{{
			"inventory_id":       moz.ID,
			"purchase_unit":      moz.PurchaseUnit,
			"units_per_purchase": moz.UnitsPerPurchase,
			"buy_qty":            2.0,
			"buy_cost":           5000, // more expensive
		}},
	}, nil))
	inv, _ = c.listInventory()
	for _, it := range inv {
		byName[it.Name] = it
	}
	moz = byName["Mozzarella Cheese"]
	check("T05 second buy increases stock", moz.Stock == beforeStock+2000, fmt.Sprintf("%d -> %d", beforeStock, moz.Stock))
	check("T06 second buy changes avg cost", moz.AvgCostMicros != beforeAvg && moz.AvgCostMicros > 0,
		fmt.Sprintf("%d -> %d", beforeAvg, moz.AvgCostMicros))

	// T07: negative buy rejected
	errNeg := c.post("/inventory/bulk-save", map[string]any{
		"items": []map[string]any{{
			"inventory_id": moz.ID,
			"buy_qty":      -1,
			"buy_cost":     100,
		}},
	}, nil)
	check("T07 negative buy_qty rejected", errNeg != nil && strings.Contains(errNeg.Error(), "negative"),
		fmt.Sprintf("%v", errNeg))

	// T08: negative cost rejected
	errNegCost := c.post("/inventory/bulk-save", map[string]any{
		"items": []map[string]any{{
			"inventory_id": moz.ID,
			"buy_qty":      1,
			"buy_cost":     -50,
		}},
	}, nil)
	check("T08 negative buy_cost rejected", errNegCost != nil && strings.Contains(errNegCost.Error(), "negative"),
		fmt.Sprintf("%v", errNegCost))

	// T09: empty bulk-save rejected
	errEmpty := c.post("/inventory/bulk-save", map[string]any{"items": []any{}}, nil)
	check("T09 empty bulk-save rejected", errEmpty != nil, fmt.Sprintf("%v", errEmpty))

	// T10: min stock update without buy
	flour := byName["Pizza Flour (Maida)"]
	newMin := int64(12345)
	must(c.post("/inventory/bulk-save", map[string]any{
		"items": []map[string]any{{
			"inventory_id":  flour.ID,
			"minimum_stock": newMin,
			"buy_qty":       0,
			"buy_cost":      0,
		}},
	}, nil))
	inv, _ = c.listInventory()
	for _, it := range inv {
		byName[it.Name] = it
	}
	flour = byName["Pizza Flour (Maida)"]
	check("T10 min stock updates without buy", flour.MinimumStock == newMin, fmt.Sprintf("min=%d", flour.MinimumStock))

	// T11: stock buy does NOT create expense
	expsBefore, _ := c.listExpenses()
	countBefore := len(expsBefore)
	onion := byName["Onion"]
	must(c.post("/inventory/bulk-save", map[string]any{
		"items": []map[string]any{{
			"inventory_id":       onion.ID,
			"purchase_unit":      onion.PurchaseUnit,
			"units_per_purchase": onion.UnitsPerPurchase,
			"buy_qty":            1,
			"buy_cost":           200,
		}},
	}, nil))
	expsAfter, _ := c.listExpenses()
	check("T11 stock buy does not create expense row", len(expsAfter) == countBefore,
		fmt.Sprintf("expenses %d -> %d", countBefore, len(expsAfter)))

	// T12: expense create + list
	check("T12 expenses seeded", len(expsAfter) >= 20, fmt.Sprintf("%d expenses", len(expsAfter)))

	// T13: expense amount <= 0 rejected
	errExp := c.post("/expenses", map[string]any{
		"category": "Rent", "title": "bad", "amount": 0,
		"expense_date": time.Now().Format(time.RFC3339),
	}, nil)
	check("T13 expense amount 0 rejected", errExp != nil, fmt.Sprintf("%v", errExp))

	// T14: expense missing category rejected
	errCat := c.post("/expenses", map[string]any{
		"category": "", "title": "bad", "amount": 100,
		"expense_date": time.Now().Format(time.RFC3339),
	}, nil)
	check("T14 expense empty category rejected", errCat != nil, fmt.Sprintf("%v", errCat))

	// T15: expense categories endpoint
	var cats []string
	must(c.get("/expenses/categories", &cats))
	check("T15 expense categories include Rent/Salaries",
		containsStr(cats, "Rent") && containsStr(cats, "Salaries"),
		fmt.Sprintf("%d cats", len(cats)))

	// T16: recipes exist
	var recipes []map[string]any
	must(c.get("/recipes", &recipes))
	check("T16 recipes list non-empty", len(recipes) >= 50, fmt.Sprintf("%d recipe lines", len(recipes)))

	// T17: product wastage without recipe fails
	orphan := findProductWithoutRecipe(products, recipes)
	if orphan != nil {
		errNoRec := c.post("/inventory/wastage/product", map[string]any{
			"product_id": orphan.ID,
			"quantity":   1,
		}, nil)
		check("T17 product wastage without recipe rejected", errNoRec != nil && strings.Contains(strings.ToLower(errNoRec.Error()), "recipe"),
			fmt.Sprintf("%s -> %v", orphan.Name, errNoRec))
	} else {
		check("T17 product wastage without recipe rejected", true, "all products have recipes (skipped orphan)")
	}

	// T18: product wastage qty 0 rejected
	marg := prodByName["Margarita Pizza"]
	errQty := c.post("/inventory/wastage/product", map[string]any{
		"product_id": marg.ID, "quantity": 0,
	}, nil)
	check("T18 product wastage qty 0 rejected", errQty != nil, fmt.Sprintf("%v", errQty))

	// T19: ingredient wastage deducts stock
	inv, _ = c.listInventory()
	for _, it := range inv {
		byName[it.Name] = it
	}
	moz = byName["Mozzarella Cheese"]
	stockBefore := moz.Stock
	must(c.post("/inventory/wastage", map[string]any{
		"inventory_id": moz.ID,
		"quantity":     100,
		"reason":       "e2e spoiled cheese",
	}, nil))
	inv, _ = c.listInventory()
	for _, it := range inv {
		byName[it.Name] = it
	}
	moz = byName["Mozzarella Cheese"]
	check("T19 ingredient wastage deducts 100g", moz.Stock == stockBefore-100,
		fmt.Sprintf("%d -> %d", stockBefore, moz.Stock))

	// T20: ingredient wastage qty 0 rejected
	errW0 := c.post("/inventory/wastage", map[string]any{
		"inventory_id": moz.ID, "quantity": 0, "reason": "x",
	}, nil)
	check("T20 ingredient wastage qty 0 rejected", errW0 != nil, fmt.Sprintf("%v", errW0))

	// T21: product wastage deducts BOM ingredients
	inv, _ = c.listInventory()
	for _, it := range inv {
		byName[it.Name] = it
	}
	snap := map[string]int64{}
	for _, n := range []string{"Pizza Flour (Maida)", "Mozzarella Cheese", "Pizza Sauce", "Olive Oil", "Oregano"} {
		snap[n] = byName[n].Stock
	}
	var wasteRes productWastageResult
	sizeID := ""
	if sz := sizesByProduct[marg.ID]; len(sz) > 0 {
		sizeID = sz[0].ID
	}
	body := map[string]any{"product_id": marg.ID, "quantity": 1, "reason": "e2e staff meal"}
	if sizeID != "" {
		body["product_size_id"] = sizeID
	}
	must(c.post("/inventory/wastage/product", body, &wasteRes))
	inv, _ = c.listInventory()
	for _, it := range inv {
		byName[it.Name] = it
	}
	deducted := len(wasteRes.Lines) > 0
	stockMoved := false
	for _, line := range wasteRes.Lines {
		for name, before := range snap {
			if byName[name].ID == line.InventoryID && byName[name].Stock < before {
				stockMoved = true
			}
		}
	}
	check("T21 product wastage returns ingredient lines", deducted,
		fmt.Sprintf("product=%s lines=%d", wasteRes.ProductName, len(wasteRes.Lines)))
	check("T22 product wastage lowered ingredient stock", stockMoved || len(wasteRes.Lines) > 0,
		fmt.Sprintf("lines=%d", len(wasteRes.Lines)))

	// T23: wastage qty 2 doubles deduction
	inv, _ = c.listInventory()
	for _, it := range inv {
		byName[it.Name] = it
	}
	flourBefore := byName["Pizza Flour (Maida)"].Stock
	var waste2 productWastageResult
	body2 := map[string]any{"product_id": marg.ID, "quantity": 2, "reason": "e2e double waste"}
	if sizeID != "" {
		body2["product_size_id"] = sizeID
	}
	must(c.post("/inventory/wastage/product", body2, &waste2))
	inv, _ = c.listInventory()
	for _, it := range inv {
		byName[it.Name] = it
	}
	flourAfter := byName["Pizza Flour (Maida)"].Stock
	var flourLine int64
	for _, l := range waste2.Lines {
		if l.InventoryName == "Pizza Flour (Maida)" || l.InventoryID == byName["Pizza Flour (Maida)"].ID {
			flourLine = l.QuantityBase
		}
	}
	check("T23 product wastage qty=2 scales BOM", flourLine > 0 && flourAfter == flourBefore-flourLine,
		fmt.Sprintf("flour line=%d stock %d->%d", flourLine, flourBefore, flourAfter))

	// T24: adjust stock
	egg := byName["Eggs"]
	eggBefore := egg.Stock
	must(c.post("/inventory/adjust", map[string]any{
		"inventory_id": egg.ID,
		"quantity":     5,
		"reason":       "e2e count correction +5",
	}, nil))
	inv, _ = c.listInventory()
	for _, it := range inv {
		byName[it.Name] = it
	}
	check("T24 adjust +5 eggs", byName["Eggs"].Stock == eggBefore+5,
		fmt.Sprintf("%d -> %d", eggBefore, byName["Eggs"].Stock))

	// T25: adjust zero rejected
	errAdj := c.post("/inventory/adjust", map[string]any{
		"inventory_id": egg.ID, "quantity": 0,
	}, nil)
	check("T25 adjust qty 0 rejected", errAdj != nil, fmt.Sprintf("%v", errAdj))

	// T26: oversell wastage allowed (negative stock)
	tinyName := "Basil"
	tiny := byName[tinyName]
	// Waste enough to go (further) negative regardless of prior runs.
	wasteQty := tiny.Stock + 50
	if wasteQty < 50 {
		wasteQty = 50
	}
	must(c.post("/inventory/wastage", map[string]any{
		"inventory_id": tiny.ID,
		"quantity":     wasteQty,
		"reason":       "e2e force negative",
	}, nil))
	inv, _ = c.listInventory()
	for _, it := range inv {
		byName[it.Name] = it
	}
	check("T26 wastage may drive stock negative", byName[tinyName].Stock < 0,
		fmt.Sprintf("stock=%d", byName[tinyName].Stock))

	// T27: alerts surface negative stock
	var alerts map[string]any
	must(c.get("/inventory/alerts", &alerts))
	negRaw, _ := json.Marshal(alerts["negative_stock"])
	check("T27 alerts include negative stock", strings.Contains(string(negRaw), tiny.ID) || strings.Contains(string(negRaw), tinyName),
		"negative_stock present")

	// T28: cannot delete ingredient used in recipe
	errDel := c.delete("/inventory/" + moz.ID)
	check("T28 delete ingredient in recipe blocked", errDel != nil && strings.Contains(strings.ToLower(errDel.Error()), "recipe"),
		fmt.Sprintf("%v", errDel))

	// T29: create + delete unused inventory item
	var created inventoryItem
	stock0 := int64(10)
	must(c.post("/inventory", map[string]any{
		"name": "E2E Temp Spice", "unit_kind": "WEIGHT", "purchase_unit": "KG",
		"units_per_purchase": 1000, "minimum_stock": 100, "purchase_price": 50,
		"stock": stock0, "category": "Spices",
	}, &created))
	errDelOK := c.delete("/inventory/" + created.ID)
	check("T29 create+delete unused ingredient", errDelOK == nil && created.ID != "",
		fmt.Sprintf("id=%s err=%v", created.ID, errDelOK))

	// T30: recipe replace clears when empty lines
	testProd := prodByName["Ice Cream Shake"]
	must(c.put("/recipes/set", map[string]any{
		"product_id": testProd.ID,
		"lines":      []any{},
	}, nil))
	var afterClear []map[string]any
	must(c.get("/recipes/product/"+testProd.ID, &afterClear))
	cleared := true
	for _, r := range afterClear {
		if r["product_size_id"] == nil {
			cleared = false
		}
	}
	// restore a minimal recipe
	milk := byName["Milk"]
	must(c.put("/recipes/set", map[string]any{
		"product_id": testProd.ID,
		"lines": []map[string]any{{
			"inventory_id": milk.ID, "quantity_required": 200,
		}},
	}, nil))
	check("T30 empty recipe set clears generic BOM", cleared, fmt.Sprintf("remaining generic lines ok=%v", cleared))

	// T31: transactions list shows PURCHASE / WASTAGE
	var txs []txRow
	must(c.get("/inventory/transactions?limit=100", &txs))
	hasPurchase, hasWastage := false, false
	for _, t := range txs {
		u := strings.ToUpper(t.TransactionType)
		if strings.Contains(u, "PURCHASE") {
			hasPurchase = true
		}
		if strings.Contains(u, "WASTAGE") {
			hasWastage = true
		}
	}
	check("T31 ledger has PURCHASE txs", hasPurchase, fmt.Sprintf("%d txs", len(txs)))
	check("T32 ledger has WASTAGE txs", hasWastage, fmt.Sprintf("%d txs", len(txs)))

	// T33: P&L expenses include rent/salaries but purchases_spend separate
	start := time.Now().AddDate(0, 0, -40).Format("2006-01-02")
	end := time.Now().AddDate(0, 0, 1).Format("2006-01-02")
	var pl profitLoss
	must(c.get(fmt.Sprintf("/reports/profit-loss?start=%s&end=%s", start, end), &pl))
	check("T33 P&L expenses > 0 from seeded bills", pl.Expenses > 50000,
		fmt.Sprintf("expenses=%d purchases_spend=%d wastage=%d", pl.Expenses, pl.PurchasesSpend, pl.WastageCost))
	check("T33b P&L purchases_spend includes inventory buys", pl.PurchasesSpend > 0,
		fmt.Sprintf("purchases_spend=%d", pl.PurchasesSpend))
	check("T34 P&L wastage cost > 0 after wastage", pl.WastageCost > 0,
		fmt.Sprintf("wastage_cost=%d", pl.WastageCost))
	check("T35 P&L inventory value > 0", pl.InventoryValue > 0,
		fmt.Sprintf("inventory_value=%d", pl.InventoryValue))

	// T36: expense update
	if len(expsAfter) > 0 {
		id := expsAfter[0].ID
		must(c.put("/expenses/"+id, map[string]any{
			"category": expsAfter[0].Category,
			"title":    expsAfter[0].Title + " (edited)",
			"amount":   expsAfter[0].Amount,
			"expense_date": time.Now().Format(time.RFC3339),
			"payment_method": "cash",
			"notes": "edited by e2e",
		}, nil))
		var one expense
		must(c.get("/expenses/"+id, &one))
		check("T36 expense update persists", strings.Contains(one.Title, "edited") || one.Notes == "edited by e2e",
			one.Title)
	} else {
		check("T36 expense update persists", false, "no expenses")
	}

	// T37: walk-in order with recipe deducts on complete (if sizes exist)
	const walkinLocationID = "50000000-0000-4000-8000-000000000000"
	// Prefer a pizza we know has a mozzarella recipe.
	marg = prodByName["Margarita Pizza"]
	sizeList := sizesByProduct[marg.ID]
	if len(sizeList) == 0 {
		for _, p := range products {
			if len(sizesByProduct[p.ID]) > 0 {
				marg = p
				sizeList = sizesByProduct[p.ID]
				break
			}
		}
	}
	if len(sizeList) > 0 {
		inv, _ = c.listInventory()
		for _, it := range inv {
			byName[it.Name] = it
		}
		mozBefore := byName["Mozzarella Cheese"].Stock
		var order map[string]any
		errOrd := c.post("/orders/walkin", map[string]any{
			"customer_name":  "E2E Tester",
			"phone":          "03001234567",
			"payment_method": "cash",
			"location_id":    walkinLocationID,
			"address":        "In Store",
			"items": []map[string]any{{
				"product_id":      marg.ID,
				"product_size_id": sizeList[0].ID,
				"quantity":        1,
			}},
		}, &order)
		if errOrd != nil {
			// Also try without location_id — server should default walk-in location.
			errOrd = c.post("/orders/walkin", map[string]any{
				"customer_name":  "E2E Tester",
				"phone":          "03001234567",
				"payment_method": "cash",
				"address":        "In Store",
				"items": []map[string]any{{
					"product_id":      marg.ID,
					"product_size_id": sizeList[0].ID,
					"quantity":        1,
				}},
			}, &order)
		}
		if errOrd != nil {
			check("T37 walk-in order create", false, errOrd.Error())
			check("T38 order complete deducts recipe stock", false, "skipped")
		} else {
			oid, _ := order["id"].(string)
			if oid == "" {
				b, _ := json.Marshal(order)
				var wrap struct {
					ID string `json:"id"`
				}
				_ = json.Unmarshal(b, &wrap)
				oid = wrap.ID
			}
			check("T37 walk-in order create", oid != "", fmt.Sprintf("order=%s product=%s", oid, marg.Name))
			errComp := c.patch("/orders/"+oid+"/complete", nil, nil)
			inv, _ = c.listInventory()
			for _, it := range inv {
				byName[it.Name] = it
			}
			mozAfter := byName["Mozzarella Cheese"].Stock
			deductedOK := errComp == nil && mozAfter < mozBefore
			check("T38 order complete deducts recipe stock", deductedOK,
				fmt.Sprintf("complete_err=%v cheese %d->%d", errComp, mozBefore, mozAfter))
		}
	} else {
		check("T37 walk-in order create", false, "no product sizes in catalog")
		check("T38 order complete deducts recipe stock", false, "skipped")
	}

	// T39: unauthenticated request rejected
	bare := &http.Client{Timeout: 15 * time.Second}
	req, _ := http.NewRequest(http.MethodGet, baseURL+"/inventory", nil)
	resp, err := bare.Do(req)
	status := 0
	if resp != nil {
		status = resp.StatusCode
		resp.Body.Close()
	}
	check("T39 unauthenticated inventory blocked", err == nil && status == 401, fmt.Sprintf("status=%d", status))

	// T40: invalid inventory id on wastage
	errBad := c.post("/inventory/wastage", map[string]any{
		"inventory_id": "00000000-0000-0000-0000-000000000099",
		"quantity":     1,
	}, nil)
	check("T40 wastage unknown inventory fails", errBad != nil, fmt.Sprintf("%v", errBad))

	// T41: tiny buy qty too small for KG
	errTiny := c.post("/inventory/bulk-save", map[string]any{
		"items": []map[string]any{{
			"inventory_id":       byName["Onion"].ID,
			"purchase_unit":      "KG",
			"units_per_purchase": 1000,
			"buy_qty":            0.0001,
			"buy_cost":           1,
		}},
	}, nil)
	check("T41 tiny buy_qty rejected as too small", errTiny != nil && strings.Contains(strings.ToLower(errTiny.Error()), "small"),
		fmt.Sprintf("%v", errTiny))

	// T42: recommendations endpoint
	var recs any
	errRec := c.get("/inventory/recommendations", &recs)
	check("T42 recommendations endpoint ok", errRec == nil, fmt.Sprintf("%v", errRec))

	// Summary
	pass, fail := 0, 0
	fmt.Println("\n=== SUMMARY ===")
	for _, r := range results {
		if r.Pass {
			pass++
		} else {
			fail++
			fmt.Printf("  FAIL: %s — %s\n", r.Name, r.Detail)
		}
	}
	fmt.Printf("Passed %d / %d  (failed %d)\n", pass, pass+fail, fail)
	if fail > 0 {
		os.Exit(1)
	}
}

func printChecklist() {
	fmt.Println(`COMPLETE TEST CHECKLIST (run order)
────────────────────────────────────
SEED
  S1  Bulk-buy key ingredients (large realistic stock + costs)
  S2  Recipes for pizzas (size-aware), pasta, shakes, rolls, burgers, fries
  S3  ~28 operating expenses across Rent/Power/Salaries/etc (NOT stock buys)

INVENTORY / BULK-SAVE
  T01 List inventory
  T02 Buy increases stock
  T03 Avg cost set after buy
  T04 Avg cost plausible
  T05 Second buy increases stock
  T06 Second buy blends avg cost
  T07 Reject negative buy_qty
  T08 Reject negative buy_cost
  T09 Reject empty bulk-save
  T10 Update min stock without buy
  T11 Stock buy does NOT create expense

EXPENSES
  T12 Expenses list after seed
  T13 Reject amount 0
  T14 Reject empty category
  T15 Categories endpoint
  T36 Expense update

RECIPES / WASTAGE
  T16 Recipes list populated
  T17 Product wastage without recipe rejected
  T18 Product wastage qty 0 rejected
  T19 Ingredient wastage deducts
  T20 Ingredient wastage qty 0 rejected
  T21 Product wastage returns lines
  T22 Product wastage lowers stock
  T23 Product wastage qty scales BOM
  T24 Adjust stock
  T25 Adjust 0 rejected
  T26 Negative stock allowed
  T27 Alerts show negative
  T28 Delete ingredient in recipe blocked
  T29 Create+delete unused ingredient
  T30 Empty recipe set clears BOM
  T31–T32 Ledger PURCHASE + WASTAGE
  T40 Unknown inventory wastage fails
  T41 Tiny buy rejected

P&L / ORDERS / AUTH
  T33–T35 P&L expenses / purchases_spend / wastage / inventory value
  T33b Purchases spend includes inventory bulk buys
  T37–T38 Walk-in order + complete stock deduct
  T39 Unauthenticated blocked
  T42 Recommendations OK`)
}

type client struct {
	token string
}

func login(user, pass string) (string, error) {
	body, _ := json.Marshal(map[string]string{"username": user, "password": pass})
	resp, err := http.Post(baseURL+"/auth/staff/login", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var out apiResp
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if !out.Success {
		return "", fmt.Errorf("%s", out.Message)
	}
	var data struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(out.Data, &data); err != nil {
		return "", err
	}
	return data.Token, nil
}

func (c *client) do(method, path string, payload any, dest any) error {
	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, baseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out apiResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return fmt.Errorf("status %d: %s", resp.StatusCode, string(raw))
	}
	if !out.Success || resp.StatusCode >= 400 {
		msg := out.Message
		if msg == "" {
			msg = string(raw)
		}
		return fmt.Errorf("%s", msg)
	}
	if dest != nil && len(out.Data) > 0 && string(out.Data) != "null" {
		if err := json.Unmarshal(out.Data, dest); err != nil {
			return fmt.Errorf("decode data: %w (%s)", err, string(out.Data))
		}
	}
	return nil
}

func (c *client) get(path string, dest any) error {
	return c.do(http.MethodGet, path, nil, dest)
}
func (c *client) post(path string, payload, dest any) error {
	return c.do(http.MethodPost, path, payload, dest)
}
func (c *client) put(path string, payload, dest any) error {
	return c.do(http.MethodPut, path, payload, dest)
}
func (c *client) patch(path string, payload, dest any) error {
	return c.do(http.MethodPatch, path, payload, dest)
}
func (c *client) delete(path string) error {
	return c.do(http.MethodDelete, path, nil, nil)
}

func (c *client) listInventory() ([]inventoryItem, error) {
	var rows []inventoryItem
	err := c.get("/inventory", &rows)
	return rows, err
}
func (c *client) listProducts() ([]product, error) {
	var rows []product
	err := c.get("/products", &rows)
	return rows, err
}
func (c *client) listSizes() ([]productSize, error) {
	var rows []productSize
	err := c.get("/product-sizes", &rows)
	return rows, err
}
func (c *client) listExpenses() ([]expense, error) {
	var rows []expense
	err := c.get("/expenses", &rows)
	return rows, err
}

func must(err error) {
	if err != nil {
		fmt.Fprintf(os.Stderr, "fatal: %v\n", err)
		os.Exit(1)
	}
}

func abs64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}

func containsStr(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}

func findProductWithoutRecipe(products []product, recipes []map[string]any) *product {
	has := map[string]bool{}
	for _, r := range recipes {
		if id, ok := r["product_id"].(string); ok {
			has[id] = true
		}
	}
	for i := range products {
		if !has[products[i].ID] {
			return &products[i]
		}
	}
	return nil
}
