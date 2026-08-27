package domain

import "time"

// Recurrence intervals for expenses that repeat every period.
const (
	RecurrenceNone    = "NONE"
	RecurrenceDaily   = "DAILY"
	RecurrenceWeekly  = "WEEKLY"
	RecurrenceMonthly = "MONTHLY"
	RecurrenceYearly  = "YEARLY"
)

// DefaultExpenseCategories are the running costs a restaurant actually has.
// They seed the category dropdown so the owner can log a bill in seconds.
// Stock / ingredient buys are logged here too (inventory recipes are optional).
var DefaultExpenseCategories = []string{
	"Rent",
	"Electricity",
	"Gas",
	"Water",
	"Internet",
	"Salaries",
	"Inventory / Stock",
	"Advertising",
	"Fuel",
	"Delivery Charges",
}

// Expense is any operating cost for the period, including salaries, rent, and
// stock purchases. Monthly rows are prorated across the P&L window by day.
type Expense struct {
	BaseModel
	Category      string    `gorm:"size:80;not null;index" json:"category"`
	Title         string    `gorm:"size:150;not null;default:''" json:"title"`
	Amount        int       `gorm:"not null;default:0" json:"amount"`
	ExpenseDate   time.Time `gorm:"not null;index" json:"expense_date"`
	PaymentMethod string    `gorm:"size:50;not null;default:'cash'" json:"payment_method"`
	Notes         string    `gorm:"type:text" json:"notes"`
	// ReceiptImage stores a URL/data reference to an uploaded receipt.
	ReceiptImage string `gorm:"type:text" json:"receipt_image"`

	// Recurrence marks a bill that repeats, letting the owner see committed
	// monthly costs without re-entering them.
	Recurrence string `gorm:"size:20;not null;default:'NONE'" json:"recurrence"`
}
