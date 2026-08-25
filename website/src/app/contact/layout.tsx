import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/constants";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: `Contact ${SITE_NAME}`,
  description:
    `Get in touch with ${SITE_NAME} for orders, feedback, or delivery questions.`,
  path: "/contact",
  absoluteTitle: true,
});

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
