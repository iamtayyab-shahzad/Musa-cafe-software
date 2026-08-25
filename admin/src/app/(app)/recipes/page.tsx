"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Old /recipes route → Inventory Recipes tab. */
export default function RecipesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/inventory?tab=recipes");
  }, [router]);
  return (
    <div className="flex min-h-[200px] items-center justify-center text-zinc-400">
      Moving to Inventory → Recipes…
    </div>
  );
}
