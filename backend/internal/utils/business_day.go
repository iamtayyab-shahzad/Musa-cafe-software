package utils

import "time"

const KarachiTZName = "Asia/Karachi"

// KarachiLocation is PKT (+05:00, no DST). Fallback if tzdata is missing.
func KarachiLocation() *time.Location {
	loc, err := time.LoadLocation(KarachiTZName)
	if err != nil {
		return time.FixedZone("PKT", 5*60*60)
	}
	return loc
}

// BusinessDateYMD returns Asia/Karachi calendar day as YYYY-MM-DD.
func BusinessDateYMD(t time.Time) string {
	return t.In(KarachiLocation()).Format("2006-01-02")
}
