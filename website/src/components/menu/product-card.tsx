"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { memo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCartActions } from "@/context/cart-context";
import { isDealProduct, parseDealPizzaSlots } from "@/lib/deal-flavors";
import { formatPrice } from "@/lib/utils";
import { mediaUrl } from "@/lib/media";
import type { Product } from "@/types";

const ProductModal = dynamic(
  () =>
    import("@/components/menu/product-modal").then((m) => ({
      default: m.ProductModal,
    })),
  { ssr: false },
);

interface ProductCardProps {
  product: Product;
  currency?: string;
}

function ProductCardInner({ product, currency = "Rs" }: ProductCardProps) {
  const { addItem } = useCartActions();
  const [open, setOpen] = useState(false);
  const startingPrice = Math.min(...product.sizes.map((s) => s.price));
  const wasPrice = Math.max(
    0,
    ...product.sizes.map((s) => Number(s.was_price || 0)),
  );
  const saveAmount =
    wasPrice > startingPrice ? wasPrice - startingPrice : 0;

  const requiresFlavorChoice =
    isDealProduct(product) &&
    parseDealPizzaSlots(product.description || "").length > 0;
  const multiSize = (product.sizes?.length || 0) > 1;
  const needsChooser = requiresFlavorChoice || multiSize;

  const openModal = () => {
    requestAnimationFrame(() => setOpen(true));
  };

  const quickAdd = () => {
    if (needsChooser) {
      openModal();
      return;
    }
    const size = product.sizes[0];
    if (!size) return;
    addItem(product, size, 1);
    toast.success(`${product.name} added to cart`);
  };

  return (
    <>
      <article className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 transition-colors hover:border-orange-500/40">
        {/* Mobile: compact horizontal row. Desktop (sm+): stacked card. */}
        <div className="flex gap-3 p-3 sm:block sm:gap-0 sm:p-0">
          <button
            type="button"
            onClick={openModal}
            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg sm:aspect-[4/3] sm:h-auto sm:w-full sm:rounded-none"
          >
            <Image
              src={mediaUrl(product.image, { width: 400 })}
              alt={product.name}
              fill
              className="object-cover sm:transition-transform sm:duration-500 sm:group-hover:scale-105"
              sizes="(max-width: 640px) 96px, (max-width: 768px) 100vw, 33vw"
              loading="lazy"
            />
            {product.featured && (
              <Badge className="absolute left-1 top-1 scale-90 sm:left-3 sm:top-3 sm:scale-100">
                Featured
              </Badge>
            )}
            {saveAmount > 0 ? (
              <Badge className="absolute right-1 top-1 scale-90 bg-emerald-600 text-white sm:right-3 sm:top-3 sm:scale-100">
                Save {formatPrice(saveAmount, currency)}
              </Badge>
            ) : null}
          </button>

          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 sm:space-y-3 sm:p-4">
            <div>
              <h3 className="font-display text-lg leading-tight text-white sm:text-xl">
                {product.name}
              </h3>
              <p className="mt-1 line-clamp-1 text-sm text-zinc-400 sm:line-clamp-2">
                {product.description}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-orange-400">
                  {saveAmount > 0 ? "" : "From "}
                  {formatPrice(startingPrice, currency)}
                </p>
                {saveAmount > 0 ? (
                  <p className="text-xs text-zinc-500 line-through">
                    Was {formatPrice(wasPrice, currency)}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="hidden min-h-10 sm:inline-flex"
                >
                  <Link href={`/menu/${product.id}`}>Details</Link>
                </Button>
                <Button
                  size="sm"
                  onClick={quickAdd}
                  className="min-h-10 min-w-[4.5rem] px-4"
                >
                  {needsChooser ? "Choose" : "Add"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </article>
      {open ? (
        <ProductModal product={product} open={open} onOpenChange={setOpen} />
      ) : null}
    </>
  );
}

export const ProductCard = memo(ProductCardInner);
