import type { Metadata } from "next";
import { Suspense } from "react";
import LoginClient from "./login-client";
import { SITE_NAME } from "@/lib/constants";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "Customer Login",
  description:
    `Sign in to your ${SITE_NAME} account to track and place orders.`,
  path: "/login",
});

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-10 text-zinc-500">Loading...</div>}>
      <LoginClient />
    </Suspense>
  );
}
