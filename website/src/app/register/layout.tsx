import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/constants";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "Create Account",
  description: `Create a ${SITE_NAME} customer account to order faster.`,
  path: "/register",
});

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
