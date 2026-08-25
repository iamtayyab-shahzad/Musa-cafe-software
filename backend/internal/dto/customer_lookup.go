package dto

// CustomerLookupResult is one repeat customer derived from past orders.
type CustomerLookupResult struct {
	Phone         string  `json:"phone"`
	Name          string  `json:"name"`
	Address       string  `json:"address"`
	LocationID    *string `json:"location_id,omitempty"`
	LastOrderAt   string  `json:"last_order_at"`
	OrderCount    int     `json:"order_count"`
}
