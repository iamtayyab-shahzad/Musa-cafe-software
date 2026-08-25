"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  formatDrinkFlavorNote,
  parseDrinkFlavors,
} from "@/lib/drink-flavors";
import { cn, formatPrice } from "@/lib/utils";
import type { Product, ProductSize } from "@/types";

type Props = {
  open: boolean;
  product: Product | null;
  flavorsRaw?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (product: Product, size: ProductSize, flavorNote: string) => void;
};

export function DrinkFlavorDialog({
  open,
  product,
  flavorsRaw,
  onOpenChange,
  onConfirm,
}: Props) {
  const [picked, setPicked] = useState("");
  const flavors = useMemo(() => parseDrinkFlavors(flavorsRaw), [flavorsRaw]);

  useEffect(() => {
    if (open) setPicked("");
  }, [open, product?.id]);

  if (!product) return null;

  const size = product.sizes?.[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="font-black">{product.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-zinc-400">
          Choose soft drink flavor
          {size ? ` · ${formatPrice(size.price)}` : ""}
        </p>
        <div className="space-y-2">
          <Label>Flavor</Label>
          <div className="flex flex-wrap gap-2">
            {flavors.map((flavor) => (
              <button
                key={flavor}
                type="button"
                onClick={() => setPicked(flavor)}
                className={cn(
                  "min-h-11 rounded-lg border px-4 py-2 text-sm font-bold",
                  picked === flavor
                    ? "border-orange-500 bg-orange-500 text-black"
                    : "border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-orange-500/60",
                )}
              >
                {flavor}
              </button>
            ))}
          </div>
          {!flavors.length ? (
            <p className="text-sm text-amber-400">
              No flavors configured. Add Coke / Sprite / Fanta under Settings.
            </p>
          ) : null}
        </div>
        <Button
          className="w-full"
          size="lg"
          disabled={!picked || !size}
          onClick={() => {
            if (!size || !picked) return;
            onConfirm(product, size, formatDrinkFlavorNote(picked));
            onOpenChange(false);
          }}
        >
          Add to bill
        </Button>
      </DialogContent>
    </Dialog>
  );
}
