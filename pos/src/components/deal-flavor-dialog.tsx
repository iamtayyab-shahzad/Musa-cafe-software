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
  flavorsForSlot,
  parseDealPizzaSlots,
  type DealPizzaSlot,
} from "@/lib/deal-flavors";
import { cn, formatPrice } from "@/lib/utils";
import type { Category, Product, ProductSize } from "@/types";

type Props = {
  open: boolean;
  product: Product | null;
  products: Product[];
  categories: Category[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (product: Product, size: ProductSize, flavorNote: string) => void;
};

/**
 * POS deal dialog: staff must pick a Regular Pizza flavor for each pizza
 * slot in the deal (same rules as the website).
 */
export function DealFlavorDialog({
  open,
  product,
  products,
  categories,
  onOpenChange,
  onConfirm,
}: Props) {
  const [picks, setPicks] = useState<Record<string, string>>({});

  const slots = useMemo<DealPizzaSlot[]>(
    () => (product ? parseDealPizzaSlots(product.description || "") : []),
    [product],
  );

  const menuWithCategories = useMemo(() => {
    const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
    return products.map((p) => ({
      ...p,
      category: p.category || byId[p.category_id],
    }));
  }, [products, categories]);

  useEffect(() => {
    if (open) setPicks({});
  }, [open, product?.id]);

  if (!product) return null;

  const size = product.sizes?.[0];
  const complete =
    slots.length > 0 && slots.every((slot) => Boolean(picks[slot.id]));

  const note = slots
    .map((slot) => {
      const flavor = menuWithCategories.find((p) => p.id === picks[slot.id]);
      return flavor ? `${slot.label}: ${flavor.name}` : null;
    })
    .filter(Boolean)
    .join("; ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-black">
            {product.name}
          </DialogTitle>
          <p className="text-sm text-zinc-400">{product.description}</p>
        </DialogHeader>

        <div className="relative z-20 space-y-4 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
          <Label className="block text-orange-300">
            Choose pizza flavors (size matches deal)
          </Label>
          {slots.map((slot) => {
            const options = flavorsForSlot(menuWithCategories, slot);
            const selectedId = picks[slot.id];
            return (
              <div key={slot.id} className="space-y-2">
                <Label className="text-xs text-zinc-400">{slot.label}</Label>
                {options.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    No {slot.size}{" "}
                    {slot.tier === "special" ? "Special" : "Regular"} Pizza
                    flavors available
                  </p>
                ) : (
                  <div className="grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                    {options.map((p) => {
                      const selected = selectedId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            setPicks((prev) => ({ ...prev, [slot.id]: p.id }))
                          }
                          className={cn(
                            "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                            selected
                              ? "border-orange-500 bg-orange-500/20 text-orange-200"
                              : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500",
                          )}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button
          className="w-full"
          disabled={!complete || !size}
          onClick={() => {
            if (!size || !complete) return;
            onConfirm(product, size, note);
            onOpenChange(false);
          }}
        >
          Add to Order
          {size ? ` · ${formatPrice(size.price)}` : ""}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
