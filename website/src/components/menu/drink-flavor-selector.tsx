"use client";

import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  formatDrinkFlavorNote,
  parseDrinkFlavors,
  requiresDrinkFlavor,
} from "@/lib/drink-flavors";
import { cn } from "@/lib/utils";
import type { Product } from "@/types";

export type DrinkFlavorState = {
  note: string;
  complete: boolean;
  needed: boolean;
};

type Props = {
  product: Product;
  flavorsRaw?: string | null;
  onChange: (state: DrinkFlavorState) => void;
};

export function DrinkFlavorSelector({
  product,
  flavorsRaw,
  onChange,
}: Props) {
  const needed = requiresDrinkFlavor(product);
  const flavors = useMemo(() => parseDrinkFlavors(flavorsRaw), [flavorsRaw]);
  const [picked, setPicked] = useState("");

  useEffect(() => {
    setPicked("");
    onChange({
      note: "",
      complete: !needed,
      needed,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when product changes
  }, [product.id, needed]);

  useEffect(() => {
    if (!needed) return;
    onChange({
      note: picked ? formatDrinkFlavorNote(picked) : "",
      complete: Boolean(picked),
      needed: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, needed]);

  if (!needed) return null;

  return (
    <div className="space-y-2">
      <Label className="block">Choose flavor</Label>
      <div className="flex flex-wrap gap-2">
        {flavors.map((flavor) => (
          <button
            key={flavor}
            type="button"
            onClick={() => setPicked(flavor)}
            className={cn(
              "min-h-11 rounded-md border px-3 py-2 text-sm font-semibold transition-colors",
              picked === flavor
                ? "border-orange-500 bg-orange-500 text-black"
                : "border-zinc-600 bg-zinc-900 text-zinc-100 hover:border-orange-500/60",
            )}
          >
            {flavor}
          </button>
        ))}
      </div>
      {!flavors.length ? (
        <p className="text-sm text-amber-400">
          No drink flavors available right now.
        </p>
      ) : null}
    </div>
  );
}
