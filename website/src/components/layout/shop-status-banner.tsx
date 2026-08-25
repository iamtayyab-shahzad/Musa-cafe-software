"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_SHOP_CLOSE,
  DEFAULT_SHOP_OPEN,
  getShopHoursStatus,
  type ShopHoursStatus,
} from "@/lib/shop-hours";
import { useLocale } from "@/i18n/locale-context";
import { cn } from "@/lib/utils";

export function ShopStatusBanner() {
  const { t, locale } = useLocale();
  const [status, setStatus] = useState<ShopHoursStatus | null>(null);

  useEffect(() => {
    const tick = () => {
      // Fixed shop window: 10:50 AM – 11:00 PM Asia/Karachi
      setStatus(getShopHoursStatus(DEFAULT_SHOP_OPEN, DEFAULT_SHOP_CLOSE));
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!status) {
    return (
      <div
        className="border-b border-zinc-800 bg-zinc-950 px-3 py-2 text-center text-xs text-zinc-500"
        aria-hidden
      >
        &nbsp;
      </div>
    );
  }

  const closed = !status.isOpen;
  const message =
    locale === "ur"
      ? closed
        ? t("hours_banner_closed")
            .replace("{open}", status.openLabel)
            .replace(
              "{when}",
              status.serveWhen === "today"
                ? t("hours_when_today")
                : t("hours_when_tomorrow"),
            )
        : t("hours_banner_open").replace("{close}", status.closeLabel)
      : status.bannerMessage;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "border-b px-3 py-2 text-center text-xs font-semibold sm:text-sm",
        closed
          ? "border-amber-500/30 bg-amber-500/15 text-amber-100"
          : "border-emerald-500/30 bg-emerald-500/15 text-emerald-100",
      )}
    >
      <span className="inline-flex flex-wrap items-center justify-center gap-2">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-black tracking-wide sm:text-xs",
            closed
              ? "bg-amber-500 text-black"
              : "bg-emerald-500 text-black",
          )}
        >
          {closed ? t("hours_badge_closed") : t("hours_badge_open")}
        </span>
        <span>{message}</span>
      </span>
    </div>
  );
}
