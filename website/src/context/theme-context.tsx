"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getSettings } from "@/services/api";
import { storageKey } from "@/lib/shop";

/** Website appearance presets — CSS-only, no runtime cost beyond one attribute. */
export type SiteTheme = "dark" | "dim" | "light" | "warm";

export const SITE_THEME_KEY = storageKey("site_theme");

export const SITE_THEMES: {
  id: SiteTheme;
  label: string;
  swatch: string;
}[] = [
  { id: "dark", label: "Night", swatch: "#050505" },
  { id: "dim", label: "Soft", swatch: "#1c1c1f" },
  { id: "light", label: "Day", swatch: "#f4f4f5" },
  { id: "warm", label: "Warm", swatch: "#f7f1e8" },
];

function isSiteTheme(value: string | null | undefined): value is SiteTheme {
  return (
    value === "dark" ||
    value === "dim" ||
    value === "light" ||
    value === "warm"
  );
}

type ThemeContextValue = {
  theme: SiteTheme;
  setTheme: (theme: SiteTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function applySiteTheme(theme: SiteTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

function readStoredTheme(): SiteTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SITE_THEME_KEY);
    return isSiteTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function SiteThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<SiteTheme>("dark");

  useEffect(() => {
    const stored = readStoredTheme();
    if (stored) {
      setThemeState(stored);
      applySiteTheme(stored);
      return;
    }

    // First visit: use admin-configured default from public settings.
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (cancelled) return;
        const next: SiteTheme = isSiteTheme(s.default_site_theme)
          ? s.default_site_theme
          : "dark";
        setThemeState(next);
        applySiteTheme(next);
      })
      .catch(() => {
        if (cancelled) return;
        applySiteTheme("dark");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((next: SiteTheme) => {
    setThemeState(next);
    applySiteTheme(next);
    try {
      localStorage.setItem(SITE_THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useSiteTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useSiteTheme must be used within SiteThemeProvider");
  }
  return ctx;
}
