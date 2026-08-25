/**
 * Shop open/closed for website ordering — Asia/Karachi (Pakistan).
 * Customers may still place orders when closed; we warn clearly.
 */

export const PK_TIMEZONE = "Asia/Karachi";

/** Order acceptance window (Pakistan time). */
export const DEFAULT_SHOP_OPEN = "10:50 AM";
export const DEFAULT_SHOP_CLOSE = "11:00 PM";

export type ShopHoursStatus = {
  isOpen: boolean;
  openLabel: string;
  closeLabel: string;
  /** Short badge: OPEN / CLOSED */
  badge: "OPEN" | "CLOSED";
  /** One-line status for the top banner */
  bannerMessage: string;
  /** Longer copy for checkout / cart */
  detailMessage: string;
  /** Served today after open, or tomorrow */
  serveWhen: "today" | "tomorrow";
};

function parseTimeToMinutes(label: string): number | null {
  const m = String(label || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (minute < 0 || minute > 59 || hour < 1 || hour > 12) return null;
  const ap = m[3].toUpperCase();
  if (ap === "AM") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  return hour * 60 + minute;
}

/** Current minutes since midnight in Asia/Karachi. */
export function getKarachiMinutesNow(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PK_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function formatKarachiClock(now = new Date()): string {
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: PK_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
}

/**
 * Open if openMinutes <= now < closeMinutes (same calendar day in Karachi).
 * At exactly closing time the shop is CLOSED.
 */
export function getShopHoursStatus(
  openLabel = DEFAULT_SHOP_OPEN,
  closeLabel = DEFAULT_SHOP_CLOSE,
  now = new Date(),
): ShopHoursStatus {
  const open =
    parseTimeToMinutes(openLabel) ??
    parseTimeToMinutes(DEFAULT_SHOP_OPEN)!;
  const close =
    parseTimeToMinutes(closeLabel) ??
    parseTimeToMinutes(DEFAULT_SHOP_CLOSE)!;
  const displayOpen = openLabel?.trim() || DEFAULT_SHOP_OPEN;
  const displayClose = closeLabel?.trim() || DEFAULT_SHOP_CLOSE;

  const mins = getKarachiMinutesNow(now);
  const isOpen = mins >= open && mins < close;

  if (isOpen) {
    return {
      isOpen: true,
      openLabel: displayOpen,
      closeLabel: displayClose,
      badge: "OPEN",
      bannerMessage: `We're open · Ordering until ${displayClose} (Pakistan time)`,
      detailMessage: `Kitchen is open now. Orders are prepared during ${displayOpen} – ${displayClose} (Pakistan time).`,
      serveWhen: "today",
    };
  }

  const beforeOpen = mins < open;
  const serveWhen = beforeOpen ? "today" : "tomorrow";
  const whenPhrase = beforeOpen
    ? `today when we open at ${displayOpen}`
    : `tomorrow when we open at ${displayOpen}`;

  return {
    isOpen: false,
    openLabel: displayOpen,
    closeLabel: displayClose,
    badge: "CLOSED",
    bannerMessage: `We're closed now · You can still order — we'll prepare it ${whenPhrase}`,
    detailMessage: `The shop is closed right now (open ${displayOpen} – ${displayClose}, Pakistan time). You can still place your order — we will prepare and serve it ${whenPhrase}.`,
    serveWhen,
  };
}

/** Note appended to order_notes so POS/kitchen sees after-hours clearly. */
export function afterHoursOrderNote(status: ShopHoursStatus): string {
  if (status.isOpen) return "";
  const when =
    status.serveWhen === "today"
      ? `when shop opens today at ${status.openLabel}`
      : `when shop opens tomorrow at ${status.openLabel}`;
  return `[AFTER HOURS — Pakistan] Customer ordered while closed. Prepare ${when}.`;
}
