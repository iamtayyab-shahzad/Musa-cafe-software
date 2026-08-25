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

type Props = {
  className?: string;
  compact?: boolean;
};

export function AfterHoursNotice({ className, compact }: Props) {
  const { t, locale } = useLocale();
  const [status, setStatus] = useState<ShopHoursStatus | null>(null);

  useEffect(() => {
    const tick = () => {
      setStatus(getShopHoursStatus(DEFAULT_SHOP_OPEN, DEFAULT_SHOP_CLOSE));
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!status || status.isOpen) return null;

  const detail =
    locale === "ur"
      ? t("hours_detail_closed")
          .replace("{open}", status.openLabel)
          .replace("{close}", status.closeLabel)
          .replace(
            "{when}",
            status.serveWhen === "today"
              ? t("hours_when_today")
              : t("hours_when_tomorrow"),
          )
      : status.detailMessage;

  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-50",
        compact ? "p-3 text-xs sm:text-sm" : "p-4 text-sm",
        className,
      )}
    >
      <p className="font-bold text-amber-200">
        {t("hours_badge_closed")} — {t("hours_still_order")}
      </p>
      <p className="mt-1 leading-relaxed text-amber-100/90">{detail}</p>
    </div>
  );
}
