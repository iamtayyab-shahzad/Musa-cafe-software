import type { Metadata } from "next";
import { Suspense } from "react";
import OrderSuccessClient from "./order-success-client";
import { SITE_NAME } from "@/lib/constants";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "Order Confirmed",
  description: `Your ${SITE_NAME} order has been placed successfully.`,
  path: "/order-success",
});

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<div className="p-10 text-zinc-500">Loading...</div>}>
      <OrderSuccessClient />
    </Suspense>
  );
}
