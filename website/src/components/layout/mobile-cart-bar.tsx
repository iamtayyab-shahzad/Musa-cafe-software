"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/context/cart-context";
import { useSettings } from "@/hooks/use-settings";
import { formatPrice } from "@/lib/utils";

const HIDDEN_PREFIXES = ["/cart", "/checkout", "/order-success", "/login", "/register"];

/**
 * Mobile-only sticky checkout CTA. Desktop unchanged (header bag is enough).
 * No animation libs — plain fixed bar to keep main-thread cost near zero.
 */
export function MobileCartBar() {
  const pathname = usePathname();
  const { itemCount, payable } = useCart();
  const { settings } = useSettings();
  const currency = settings?.currency ?? "Rs";

  if (itemCount <= 0) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="pointer-events-auto border-t border-zinc-800 bg-black/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm">
        <Link
          href="/cart"
          className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-orange-500 px-4 py-3 text-black active:bg-orange-400"
        >
          <span className="flex items-center gap-2 font-semibold">
            <ShoppingBag className="h-5 w-5 shrink-0" aria-hidden />
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
          <span className="font-bold">
            {formatPrice(payable, currency)} · View cart
          </span>
        </Link>
      </div>
    </div>
  );
}
