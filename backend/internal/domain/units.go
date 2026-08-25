package domain

import "strings"

// Unit handling for the inventory module.
//
// Design: every inventory item stores stock in a single canonical BASE unit
// determined by its kind:
//
//	WEIGHT -> gram        (g)
//	VOLUME -> millilitre  (ml)
//	COUNT  -> piece       (pcs)
//
// Purchases arrive in a PURCHASE unit (KG, Litre, Carton, Packet, ...) and are
// converted to base units with UnitsPerPurchase. Keeping stock as an integer
// count of base units avoids floating point drift entirely, which matters
// because these numbers feed cost of goods sold and profit reporting.
const (
	UnitKindWeight = "WEIGHT"
	UnitKindVolume = "VOLUME"
	UnitKindCount  = "COUNT"
)

const (
	BaseUnitGram       = "g"
	BaseUnitMillilitre = "ml"
	BaseUnitPiece      = "pcs"
)

// CostScale is the fixed-point scale used for per-base-unit costs.
//
// Money in this system is whole Rupees, but a per-gram cost is fractional
// (Rs 1200/kg = Rs 1.2/g). Storing cost as micro-Rupees per base unit keeps
// full precision using integers: Rs 1.2/g == 1_200_000 micros.
const CostScale int64 = 1_000_000

// BaseUnitForKind returns the canonical base unit for a unit kind.
func BaseUnitForKind(kind string) string {
	switch strings.ToUpper(strings.TrimSpace(kind)) {
	case UnitKindVolume:
		return BaseUnitMillilitre
	case UnitKindCount:
		return BaseUnitPiece
	default:
		return BaseUnitGram
	}
}

// NormalizeUnitKind coerces free-text input to a valid unit kind.
func NormalizeUnitKind(kind string) string {
	switch strings.ToUpper(strings.TrimSpace(kind)) {
	case UnitKindVolume:
		return UnitKindVolume
	case UnitKindCount:
		return UnitKindCount
	case UnitKindWeight:
		return UnitKindWeight
	}
	return UnitKindWeight
}

// DefaultUnitsPerPurchase provides sensible conversion factors for the purchase
// units a restaurant actually buys in, so the owner rarely types a factor.
// The value is how many BASE units are contained in one purchase unit.
func DefaultUnitsPerPurchase(purchaseUnit string) int64 {
	switch strings.ToLower(strings.TrimSpace(purchaseUnit)) {
	case "kg", "kilogram", "kilo":
		return 1000
	case "g", "gram", "grams":
		return 1
	case "l", "litre", "liter", "ltr":
		return 1000
	case "ml", "millilitre", "milliliter":
		return 1
	case "dozen":
		return 12
	case "carton", "case":
		return 24
	case "pcs", "piece", "pieces", "packet", "pack", "bottle", "can", "jar",
		"tin", "bag", "box", "roll", "unit":
		return 1
	}
	return 1
}

// CostMicrosPerBaseUnit converts a total spend (whole Rupees) over a quantity of
// base units into a per-base-unit cost in micro-Rupees. Returns 0 when the
// quantity is not positive so callers never divide by zero.
func CostMicrosPerBaseUnit(totalRupees int, quantityBase int64) int64 {
	if quantityBase <= 0 {
		return 0
	}
	return (int64(totalRupees) * CostScale) / quantityBase
}

// ValueFromMicros converts a per-base-unit micro cost and a base quantity back
// into whole Rupees, rounding to nearest.
func ValueFromMicros(costMicros int64, quantityBase int64) int {
	if costMicros == 0 || quantityBase == 0 {
		return 0
	}
	total := costMicros * quantityBase
	// Round half away from zero for predictable money values.
	if total >= 0 {
		return int((total + CostScale/2) / CostScale)
	}
	return int((total - CostScale/2) / CostScale)
}
