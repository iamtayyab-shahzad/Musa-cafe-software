"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/utils";
import type { Product, ProductSize } from "@/types";

type Props = {
  open: boolean;
  product: Product | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (product: Product, size: ProductSize, price: number) => void;
};

export function ManualPriceDialog({
  open,
  product,
  onOpenChange,
  onConfirm,
}: Props) {
  const [priceText, setPriceText] = useState("");

  useEffect(() => {
    if (open && product?.sizes?.[0]) {
      setPriceText(String(product.sizes[0].price));
    }
  }, [open, product?.id, product?.sizes]);

  if (!product) return null;

  const size = product.sizes?.[0];
  if (!size) return null;

  const defaultPrice = size.price;

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
          Enter sale price for this item. Default: {formatPrice(defaultPrice)}
          {size.size ? ` (${size.size})` : ""}
        </p>
        <div className="space-y-2">
          <Label htmlFor="manual-price">Price (Rs)</Label>
          <Input
            id="manual-price"
            inputMode="numeric"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value.replace(/[^\d]/g, ""))}
            placeholder={String(defaultPrice)}
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const price = Number(priceText);
              if (!Number.isFinite(price) || price <= 0) return;
              onConfirm(product, size, price);
              onOpenChange(false);
            }}
          >
            Add to bill
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
