"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, ShoppingBag, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useCart } from "@/context/cart-context";
import { useLocale } from "@/i18n/locale-context";
import type { MessageKey } from "@/i18n/messages";
import { ThemePicker } from "@/components/layout/theme-picker";
import { SITE_NAME } from "@/lib/constants";
import { shop, shopDisplayParts } from "@/lib/shop";
import { mediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

const NAV: { href: string; key: MessageKey }[] = [
  { href: "/", key: "nav_home" },
  { href: "/menu", key: "nav_menu" },
  { href: "/about", key: "nav_about" },
  { href: "/contact", key: "nav_contact" },
];

export function Header() {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const { isAuthenticated, customer, logout } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const brand = shopDisplayParts();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const langToggle = (
    <div
      className="flex items-center rounded-full border border-zinc-700 p-0.5"
      role="group"
      aria-label={t("lang_switch")}
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={cn(
          "rounded-full px-2.5 py-1.5 text-xs font-bold transition-colors",
          locale === "en"
            ? "bg-orange-500 text-black"
            : "text-zinc-400 hover:text-white",
        )}
      >
        {t("lang_en")}
      </button>
      <button
        type="button"
        onClick={() => setLocale("ur")}
        className={cn(
          "rounded-full px-2.5 py-1.5 text-xs font-bold transition-colors font-urdu",
          locale === "ur"
            ? "bg-orange-500 text-black"
            : "text-zinc-400 hover:text-white",
        )}
      >
        {t("lang_ur")}
      </button>
    </div>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-xl tracking-wide text-white sm:gap-2.5 sm:text-2xl"
        >
          <Image
            src={mediaUrl(shop.logo || "/logo.svg", { width: 80 })}
            alt={SITE_NAME}
            width={40}
            height={40}
            className="h-9 w-9 rounded-full object-cover sm:h-10 sm:w-10"
            priority
          />
          <span>
            <span className="text-orange-500">{brand.accent}</span>
            {brand.rest ? ` ${brand.rest}` : ""}
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-orange-400",
                locale === "ur" && "font-urdu text-base",
                pathname === link.href ? "text-orange-400" : "text-zinc-300",
              )}
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden sm:block">{langToggle}</div>
          <div className="hidden sm:block">
            <ThemePicker compact />
          </div>

          <Button asChild variant="ghost" size="icon" className="relative h-11 w-11">
            <Link href="/cart" aria-label={t("nav_cart")}>
              <ShoppingBag className="h-5 w-5" />
              {itemCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-black">
                  {itemCount}
                </span>
              )}
            </Link>
          </Button>

          {isAuthenticated ? (
            <div className="hidden items-center gap-2 sm:flex">
              <Button asChild variant="ghost" size="sm">
                <Link href="/account/orders">{t("nav_orders")}</Link>
              </Button>
              <span className="max-w-[8rem] truncate text-sm text-zinc-400">
                {customer?.name}
              </span>
              <Button variant="ghost" size="sm" onClick={logout}>
                {t("nav_logout")}
              </Button>
            </div>
          ) : (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="hidden h-11 w-11 sm:inline-flex"
            >
              <Link href="/login" aria-label={t("nav_login")}>
                <User className="h-5 w-5" />
              </Link>
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-black px-4 py-4 md:hidden">
          <div className="mb-3 flex items-center gap-2">
            {langToggle}
            <ThemePicker compact />
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-2 py-3 text-base font-medium",
                  locale === "ur" && "font-urdu",
                  pathname === link.href ? "text-orange-400" : "text-zinc-300",
                )}
              >
                {t(link.key)}
              </Link>
            ))}
            {isAuthenticated ? (
              <>
                <Link
                  href="/account/orders"
                  className={cn(
                    "rounded-md px-2 py-3 text-base font-medium text-zinc-300",
                    locale === "ur" && "font-urdu",
                    pathname.startsWith("/account") && "text-orange-400",
                  )}
                >
                  {t("nav_orders")}
                </Link>
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-2 py-3 text-left text-base font-medium text-zinc-300",
                    locale === "ur" && "font-urdu text-right",
                  )}
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                >
                  {t("nav_logout")}
                  {customer?.name ? ` (${customer.name})` : ""}
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className={cn(
                  "rounded-md px-2 py-3 text-base font-medium text-zinc-300",
                  locale === "ur" && "font-urdu",
                )}
              >
                {t("nav_login")}
              </Link>
            )}
            <p className="px-2 pt-2 text-xs text-zinc-500">{SITE_NAME}</p>
          </nav>
        </div>
      )}
    </header>
  );
}
