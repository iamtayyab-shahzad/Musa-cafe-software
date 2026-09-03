package service

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"backend/internal/domain"
	"backend/internal/dto"
	"backend/internal/shop"
	"backend/internal/utils"

	"gorm.io/gorm"
)

type SettingService struct {
	db *gorm.DB

	mu        sync.RWMutex
	cached    *domain.Setting
	cachedAt  time.Time
	cacheTTL  time.Duration
}

func NewSettingService(db *gorm.DB) *SettingService {
	return &SettingService{
		db:       db,
		cacheTTL: 60 * time.Second,
	}
}

func (s *SettingService) invalidateCache() {
	s.mu.Lock()
	s.cached = nil
	s.cachedAt = time.Time{}
	s.mu.Unlock()
}

func (s *SettingService) Get() (*domain.Setting, error) {
	s.mu.RLock()
	if s.cached != nil && time.Since(s.cachedAt) < s.cacheTTL {
		cp := *s.cached
		s.mu.RUnlock()
		return &cp, nil
	}
	s.mu.RUnlock()

	var setting domain.Setting
	err := s.db.First(&setting).Error
	if err == gorm.ErrRecordNotFound {
		info := shop.Current()
		setting = domain.Setting{
			RestaurantName:    info.Name,
			Phone:             info.Phone,
			WhatsApp:          info.WhatsApp,
			Currency:          info.Currency,
			CashOnDeliveryFee: 0,
			OpeningTime:       info.OpeningTime,
			ClosingTime:       info.ClosingTime,
			DrinkFlavors:      `["Coke","Sprite","Fanta"]`,
			DefaultSiteTheme:  "dark",
		}
		if createErr := s.db.Create(&setting).Error; createErr != nil {
			return nil, createErr
		}
		s.mu.Lock()
		s.cached = &setting
		s.cachedAt = time.Now()
		s.mu.Unlock()
		cp := setting
		return &cp, nil
	}
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(setting.DrinkFlavors) == "" {
		setting.DrinkFlavors = `["Coke","Sprite","Fanta"]`
		_ = s.db.Model(&setting).Update("drink_flavors", setting.DrinkFlavors).Error
	}
	if strings.TrimSpace(setting.DefaultSiteTheme) == "" {
		setting.DefaultSiteTheme = "dark"
		_ = s.db.Model(&setting).Update("default_site_theme", setting.DefaultSiteTheme).Error
	}

	s.mu.Lock()
	s.cached = &setting
	s.cachedAt = time.Now()
	s.mu.Unlock()
	cp := setting
	return &cp, nil
}

// UpdateFromDTO applies partial settings via struct fields so GORM maps
// column names correctly (e.g. WhatsApp -> whats_app).
func (s *SettingService) UpdateFromDTO(input dto.UpdateSettingsRequest) (*domain.Setting, error) {
	current, err := s.Get()
	if err != nil {
		return nil, err
	}

	patch := domain.Setting{}
	cols := make([]string, 0, 12)
	if input.RestaurantName != nil {
		patch.RestaurantName = *input.RestaurantName
		cols = append(cols, "RestaurantName")
	}
	if input.Phone != nil {
		patch.Phone = *input.Phone
		cols = append(cols, "Phone")
	}
	if input.WhatsApp != nil {
		patch.WhatsApp = *input.WhatsApp
		cols = append(cols, "WhatsApp")
	}
	if input.Logo != nil {
		patch.Logo = *input.Logo
		cols = append(cols, "Logo")
	}
	if input.Address != nil {
		patch.Address = *input.Address
		cols = append(cols, "Address")
	}
	if input.OpeningTime != nil {
		patch.OpeningTime = *input.OpeningTime
		cols = append(cols, "OpeningTime")
	}
	if input.ClosingTime != nil {
		patch.ClosingTime = *input.ClosingTime
		cols = append(cols, "ClosingTime")
	}
	if input.CashOnDeliveryFee != nil {
		patch.CashOnDeliveryFee = *input.CashOnDeliveryFee
		cols = append(cols, "CashOnDeliveryFee")
	}
	if input.Currency != nil {
		patch.Currency = *input.Currency
		cols = append(cols, "Currency")
	}
	if input.GoogleMaps != nil {
		patch.GoogleMaps = *input.GoogleMaps
		cols = append(cols, "GoogleMaps")
	}
	if input.Facebook != nil {
		patch.Facebook = *input.Facebook
		cols = append(cols, "Facebook")
	}
	if input.Instagram != nil {
		patch.Instagram = *input.Instagram
		cols = append(cols, "Instagram")
	}
	if input.DrinkFlavors != nil {
		patch.DrinkFlavors = *input.DrinkFlavors
		cols = append(cols, "DrinkFlavors")
	}
	if input.DefaultSiteTheme != nil {
		theme := strings.TrimSpace(strings.ToLower(*input.DefaultSiteTheme))
		switch theme {
		case "dark", "dim", "light", "warm":
			patch.DefaultSiteTheme = theme
			cols = append(cols, "DefaultSiteTheme")
		default:
			return nil, utils.NewAppError(http.StatusBadRequest, "invalid default_site_theme")
		}
	}
	// Bool flags use a map so GORM always persists true AND false.
	// Struct Updates can skip zero-values even with Select in some paths.
	boolPatch := map[string]any{}
	if input.PosOneClickComplete != nil {
		boolPatch["pos_one_click_complete"] = *input.PosOneClickComplete
	}
	if input.PosAllowHistoryEdit != nil {
		boolPatch["pos_allow_history_edit"] = *input.PosAllowHistoryEdit
	}
	if len(cols) == 0 && len(boolPatch) == 0 {
		return nil, utils.NewAppError(http.StatusBadRequest, "no fields to update")
	}

	if len(cols) > 0 {
		if err := s.db.Model(current).Select(cols).Updates(patch).Error; err != nil {
			return nil, err
		}
	}
	if len(boolPatch) > 0 {
		if err := s.db.Model(current).Updates(boolPatch).Error; err != nil {
			return nil, err
		}
	}
	s.invalidateCache()
	return s.Get()
}
