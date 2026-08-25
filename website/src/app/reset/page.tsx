import type { Metadata } from "next";
import { Suspense } from "react";
import ResetClient from "./reset-client";
import { SITE_NAME } from "@/lib/constants";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "Reset Password",
  description: `Set a new password for your ${SITE_NAME} account.`,
  path: "/reset",
});

export default function ResetPage() {
  return (
    <Suspense fallback={<div className="p-10 text-zinc-500">Loading...</div>}>
      <ResetClient />
    </Suspense>
  );
}
