package dto

// Page is the standard paginated list envelope. Returned when a client passes
// ?limit= (and optional ?offset=). Without those query params, handlers keep
// returning a bare array so existing POS/admin clients stay compatible.
type Page[T any] struct {
	Items  []T   `json:"items"`
	Total  int64 `json:"total"`
	Limit  int   `json:"limit"`
	Offset int   `json:"offset"`
}
