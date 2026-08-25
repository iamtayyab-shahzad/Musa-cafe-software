import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { SITE_NAME } from "@/lib/constants";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "Guest Checkout",
  description:
    `Checkout as a guest at ${SITE_NAME} — no account required.`,
  path: "/checkout/guest",
});

export default function GuestCheckoutPage() {
  return <CheckoutForm guestMode />;
}
