"use client";

import Link from "next/link";
import { MapPin, Phone } from "lucide-react";
import { restaurant } from "@/data/krunchies";
import { useSettings } from "@/hooks/use-settings";
import { useLocale } from "@/i18n/locale-context";
import type { MessageKey } from "@/i18n/messages";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M14 8h2V5h-2c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.3L16 11h-3V9c0-.6.4-1 1-1z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const FOOTER_NAV: { href: string; key: MessageKey }[] = [
  { href: "/", key: "nav_home" },
  { href: "/menu", key: "nav_menu" },
  { href: "/about", key: "nav_about" },
  { href: "/contact", key: "nav_contact" },
];

export function Footer() {
  const { settings } = useSettings();
  const { t, locale } = useLocale();
  const name = settings?.restaurant_name || SITE_NAME;
  const phone = settings?.phone || "";
  const address = settings?.address || "";
  const opening = settings?.opening_time || restaurant.openingTime;
  const closing = settings?.closing_time || restaurant.closingTime;
  const facebook = settings?.facebook || "#";
  const instagram = settings?.instagram || "#";
  const urdu = locale === "ur";

  return (
    <footer className="mt-auto border-t border-white/10 bg-zinc-950">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <p className="font-display text-2xl text-white">
            <span className="text-orange-500">
              {name.split(" ")[0] || SITE_NAME}
            </span>{" "}
            {name.split(" ").slice(1).join(" ") || "Pizza"}
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">
            {restaurant.tagline}
          </p>
          <p
            className={cn(
              "mt-3 max-w-sm text-sm leading-relaxed text-zinc-400",
              urdu && "font-urdu text-base leading-loose",
            )}
          >
            {restaurant.deliveryNote}. {t("footer_hours")} {opening}–{closing}.
          </p>
        </div>

        <div>
          <h3
            className={cn(
              "text-sm font-semibold uppercase tracking-wider text-orange-400",
              urdu && "font-urdu text-base tracking-normal",
            )}
          >
            {t("footer_explore")}
          </h3>
          <ul className="mt-4 space-y-2">
            {FOOTER_NAV.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cn(
                    "text-sm text-zinc-400 transition-colors hover:text-white",
                    urdu && "font-urdu text-base",
                  )}
                >
                  {t(link.key)}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/menu"
                className={cn(
                  "text-sm text-zinc-400 transition-colors hover:text-white",
                  urdu && "font-urdu text-base",
                )}
              >
                {t("nav_order_online")}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3
            className={cn(
              "text-sm font-semibold uppercase tracking-wider text-orange-400",
              urdu && "font-urdu text-base tracking-normal",
            )}
          >
            {t("footer_contact")}
          </h3>
          <ul className="mt-4 space-y-3 text-sm text-zinc-400">
            {address ? (
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-orange-500" />
                {address}
              </li>
            ) : null}
            {phone ? (
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-orange-500" />
                <a href={`tel:${phone}`} className="hover:text-white">
                  {phone}
                </a>
              </li>
            ) : null}
            {restaurant.alternatePhone ? (
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-orange-500" />
                <a
                  href={`tel:${restaurant.alternatePhone.replace(/-/g, "")}`}
                  className="hover:text-white"
                >
                  {restaurant.alternatePhone}
                </a>
              </li>
            ) : null}
            <li className={urdu ? "font-urdu text-base" : undefined}>
              {t("footer_hours")} {opening} – {closing}
            </li>
          </ul>
          <div className="mt-4 flex gap-3">
            <a
              href={facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-orange-400"
              aria-label="Facebook"
            >
              <FacebookIcon className="h-5 w-5" />
            </a>
            <a
              href={instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-orange-400"
              aria-label="Instagram"
            >
              <InstagramIcon className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-white/5 py-5 text-center text-xs text-zinc-600">
        © {new Date().getFullYear()} {name}. All rights reserved.
      </div>
    </footer>
  );
}
