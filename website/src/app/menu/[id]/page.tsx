"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/context/cart-context";
import {
  DealFlavorSelector,
  type DealFlavorState,
} from "@/components/menu/deal-flavor-selector";
import {
  DrinkFlavorSelector,
  type DrinkFlavorState,
} from "@/components/menu/drink-flavor-selector";
import { useSettings } from "@/hooks/use-settings";
import { mediaUrl } from "@/lib/media";
import { cn, formatPrice } from "@/lib/utils";
import { getProductById } from "@/services/api";
import type { Product, ProductSize } from "@/types";

export default function ProductDetailsPage() {
  const params = useParams<{ id: string }>();
  const { addItem } = useCart();
  const { settings } = useSettings();
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [dealFlavors, setDealFlavors] = useState<DealFlavorState>({
    note: "",
    complete: true,
    hasSlots: false,
  });
  const [drinkFlavors, setDrinkFlavors] = useState<DrinkFlavorState>({
    note: "",
    complete: true,
    needed: false,
  });

  const handleFlavorChange = useCallback(
    (state: DealFlavorState) => setDealFlavors(state),
    [],
  );
  const handleDrinkFlavorChange = useCallback(
    (state: DrinkFlavorState) => setDrinkFlavors(state),
    [],
  );

  useEffect(() => {
    if (!params.id) return;
    setLoading(true);
    getProductById(params.id)
      .then((data) => {
        setProduct(data);
        setSelectedSize(data?.sizes[0] ?? null);
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return <div className="p-10 text-zinc-500">Loading product...</div>;
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-display text-4xl text-white">Product not found</h1>
        <Button asChild className="mt-6">
          <Link href="/menu">Back to Menu</Link>
        </Button>
      </div>
    );
  }

  const handleAdd = () => {
    if (!selectedSize) return;
    if (dealFlavors.hasSlots && !dealFlavors.complete) {
      toast.error("Please select a flavor for each pizza in this deal");
      return;
    }
    if (drinkFlavors.needed && !drinkFlavors.complete) {
      toast.error("Please choose a drink flavor");
      return;
    }
    const combinedInstructions = [
      dealFlavors.note,
      drinkFlavors.note,
      instructions.trim(),
    ]
      .filter(Boolean)
      .join(" | ");
    addItem(product, selectedSize, quantity, combinedInstructions || undefined);
    toast.success(`${product.name} added to cart`);
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:items-start lg:gap-12 lg:px-8 lg:py-12">
      <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-2xl lg:max-w-none">
        <Image
          src={mediaUrl(product.image, { width: 1200 })}
          alt={product.name}
          fill
          className="object-cover"
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
        />
      </div>
      <div className="relative z-10 rounded-xl bg-zinc-950/95 lg:bg-transparent">
        <p className="text-sm uppercase tracking-wider text-orange-500">
          {product.category?.name}
        </p>
        <h1 className="mt-2 font-display text-5xl text-white">{product.name}</h1>
        <p className="mt-4 text-zinc-400">{product.description}</p>

        <div
          className={
            dealFlavors.hasSlots || drinkFlavors.needed
              ? "relative z-20 mt-8 space-y-4"
              : "mt-8 space-y-4"
          }
        >
          <DealFlavorSelector product={product} onChange={handleFlavorChange} />
          <DrinkFlavorSelector
            product={product}
            flavorsRaw={settings?.drink_flavors}
            onChange={handleDrinkFlavorChange}
          />
        </div>

        <div className="mt-8">
          <Label className="mb-3 block">Choose Size</Label>
          <div className="flex flex-wrap gap-2">
            {product.sizes.map((size) => (
              <button
                key={size.id}
                type="button"
                onClick={() => setSelectedSize(size)}
                className={cn(
                  "min-h-11 rounded-md border px-4 py-3 text-sm font-semibold transition-colors",
                  selectedSize?.id === size.id
                    ? "border-orange-500 bg-orange-500 text-black"
                    : "border-zinc-600 bg-zinc-900 text-zinc-100 hover:border-orange-500/60",
                )}
              >
                {size.size} · {formatPrice(size.price)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <Label className="mb-2 block">Quantity</Label>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              −
            </Button>
            <span className="w-8 text-center font-semibold">{quantity}</span>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setQuantity((q) => q + 1)}
            >
              +
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <Label htmlFor="notes" className="mb-2 block">
            Special Instructions
          </Label>
          <Textarea
            id="notes"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Any special requests?"
          />
        </div>

        <Button size="lg" className="mt-8 w-full sm:w-auto" onClick={handleAdd}>
          Add to Cart ·{" "}
          {formatPrice((selectedSize?.price ?? 0) * quantity)}
        </Button>
      </div>
    </div>
  );
}
