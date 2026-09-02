"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isPizzaProduct, pizzaSellableSizes } from "@/lib/is-pizza";
import { cn, formatPrice } from "@/lib/utils";
import type { Product, ProductSize } from "@/types";

type Props = {
  open: boolean;
  product: Product | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (product: Product, size: ProductSize) => void;
};

export function PizzaSizeDialog({
  open,
  product,
  onOpenChange,
  onConfirm,
}: Props) {
  const sizes = useMemo(() => {
    if (!product) return [] as ProductSize[];
    return isPizzaProduct(product)
      ? pizzaSellableSizes(product.sizes)
      : product.sizes || [];
  }, [product]);

  const [kbIndex, setKbIndex] = useState(0);
  const kbIndexRef = useRef(0);
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;

  useEffect(() => {
    if (open) {
      setKbIndex(0);
      kbIndexRef.current = 0;
    }
  }, [open, product?.id]);

  useEffect(() => {
    kbIndexRef.current = kbIndex;
  }, [kbIndex]);

  useEffect(() => {
    if (!open || !product) return;

    const onKey = (e: KeyboardEvent) => {
      const list = sizesRef.current;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        if (!list.length) return;
        setKbIndex((i) => Math.min(list.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        if (!list.length) return;
        setKbIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const size = list[kbIndexRef.current];
        if (!size) return;
        onConfirm(product, size);
        onOpenChange(false);
      }
    };

    // Capture so we beat the page-level New Order listener.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, product, onConfirm, onOpenChange]);

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
        data-pos-dialog-open="true"
      >
        <DialogHeader>
          <DialogTitle className="font-black">{product.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-zinc-400">
          Choose size · ↑↓←→ move · Enter add
        </p>
        <div className="grid grid-cols-2 gap-2">
          {sizes.map((s, index) => {
            const focused = index === kbIndex;
            return (
              <button
                key={s.id || s.size}
                type="button"
                onMouseEnter={() => setKbIndex(index)}
                onClick={() => {
                  onConfirm(product, s);
                  onOpenChange(false);
                }}
                className={cn(
                  "min-h-14 rounded-lg border px-3 py-3 text-center transition",
                  focused
                    ? "pos-kb-focus border-orange-500 bg-orange-500 text-black"
                    : "border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-orange-500/60",
                )}
              >
                <p className="text-sm font-black uppercase">{s.size}</p>
                <p
                  className={cn(
                    "mt-1 text-sm font-semibold",
                    focused ? "text-black/80" : "text-orange-400",
                  )}
                >
                  {formatPrice(s.price)}
                </p>
              </button>
            );
          })}
        </div>
        <Button
          className="w-full"
          size="lg"
          disabled={!sizes[kbIndex]}
          onClick={() => {
            const size = sizes[kbIndex];
            if (!size) return;
            onConfirm(product, size);
            onOpenChange(false);
          }}
        >
          Add to bill
        </Button>
      </DialogContent>
    </Dialog>
  );
}
