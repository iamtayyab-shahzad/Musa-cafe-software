import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/constants";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "Your Cart",
  description: `Review your ${SITE_NAME} order before checkout.`,
  path: "/cart",
});

export default function CartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
