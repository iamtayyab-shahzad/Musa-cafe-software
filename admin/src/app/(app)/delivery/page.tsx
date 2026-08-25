"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Old /delivery route → Website Settings (delivery section). */
export default function DeliveryRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/website-settings#delivery");
  }, [router]);
  return (
    <div className="flex min-h-[200px] items-center justify-center text-zinc-400">
      Moving to Website Settings…
    </div>
  );
}
