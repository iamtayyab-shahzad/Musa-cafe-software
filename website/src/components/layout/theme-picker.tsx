"use client";

import { useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";
import {
  SITE_THEMES,
  useSiteTheme,
  type SiteTheme,
} from "@/context/theme-context";
import { cn } from "@/lib/utils";

export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useSiteTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition-colors hover:border-orange-500/50 hover:text-orange-400",
          compact ? "h-9 w-9" : "h-11 w-11",
        )}
        aria-label="Appearance"
        aria-expanded={open}
        title="Appearance"
      >
        <Palette className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute end-0 top-full z-50 mt-2 w-44 rounded-xl border border-zinc-700 bg-zinc-950 p-2 shadow-xl">
          <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Appearance
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {SITE_THEMES.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setTheme(opt.id as SiteTheme);
                  setOpen(false);
                }}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                  theme === opt.id
                    ? "border-orange-500 bg-orange-500/10 text-orange-400"
                    : "border-zinc-800 text-zinc-300 hover:border-zinc-600",
                )}
              >
                <span
                  className="h-6 w-6 rounded-full border border-zinc-600 shadow-inner"
                  style={{ background: opt.swatch }}
                  aria-hidden
                />
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
