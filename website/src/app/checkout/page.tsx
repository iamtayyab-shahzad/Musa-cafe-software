import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { SITE_NAME } from "@/lib/constants";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "Checkout",
  description:
    `Complete your ${SITE_NAME} order and choose delivery or pickup.`,
  path: "/checkout",
});

export default function CheckoutPage() {
  return <CheckoutForm />;
}
