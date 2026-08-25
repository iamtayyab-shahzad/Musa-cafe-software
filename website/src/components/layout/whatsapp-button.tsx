"use client";

import { MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCart } from "@/context/cart-context";
import { useSettings } from "@/hooks/use-settings";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const HIDDEN_PREFIXES = ["/cart", "/checkout", "/order-success"];

/**
 * WhatsApp entry — kept lightweight (no entrance animation on mobile).
 * Hidden on cart/checkout so it never fights the sticky order CTA.
 */
export function WhatsAppButton() {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const { settings } = useSettings();
  const phone = settings?.whatsapp ?? "";
  if (!phone) return null;
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(`Hi ${SITE_NAME}! I'd like to place an order.`)}`;

  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  // Sit above the mobile cart bar when it is visible.
  const liftForCart = itemCount > 0;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className={cn(
        "fixed z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/40 md:h-14 md:w-14",
        // Left on mobile = thumb-friendly and clear of cart CTA on the right flow
        "left-4 md:left-auto md:right-6",
        liftForCart
          ? "bottom-[5.5rem] md:bottom-6"
          : "bottom-[max(1rem,env(safe-area-inset-bottom))] md:bottom-6",
      )}
    >
      <MessageCircle className="h-6 w-6 md:h-7 md:w-7" />
    </a>
  );
}
