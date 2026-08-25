import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/constants";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageSeo({
    title: "Page Not Found",
    description: `The page you requested could not be found on ${SITE_NAME}.`,
    path: "/",
  }),
  robots: {
    index: false,
    follow: true,
  },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-orange-500">
        404
      </p>
      <h1 className="mt-3 font-display text-6xl text-white">Lost the slice?</h1>
      <p className="mt-4 text-zinc-400">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-8 flex gap-3">
        <Button asChild>
          <Link href="/">Go Home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/menu">View Menu</Link>
        </Button>
      </div>
    </div>
  );
}
