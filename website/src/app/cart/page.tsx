"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/context/cart-context";
import { useSettings } from "@/hooks/use-settings";
import { getProducts } from "@/services/api";
import { cn, formatPrice } from "@/lib/utils";
import { weekendPromoLabel } from "@/lib/discount-rules";
import type { Product, ProductSize } from "@/types";
import { AfterHoursNotice } from "@/components/checkout/after-hours-notice";

export default function CartPage() {
  const {
    items,
    subtotal,
    discount,
    payable,
    changeSize,
    updateQuantity,
    updateInstructions,
    removeItem,
  } = useCart();
  const { settings } = useSettings();
  const currency = settings?.currency ?? "Rs";
  const codFee = settings?.cash_on_delivery_fee ?? 50;
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    let active = true;
    getProducts()
      .then((rows) => {
        if (active) setProducts(rows);
      })
      .catch(() => {
        /* catalog optional for size buttons */
      });
    return () => {
      active = false;
    };
  }, []);

  const sizesByProduct = useMemo(() => {
    const map = new Map<string, ProductSize[]>();
    for (const p of products) {
      if (p.sizes?.length) map.set(p.id, p.sizes);
    }
    return map;
  }, [products]);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-5xl text-white">Your Cart</h1>
        <p className="mt-4 text-zinc-400">Your cart is empty.</p>
        <Button asChild className="mt-8">
          <Link href="/menu">Browse Menu</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <h1 className="font-display text-4xl text-white sm:text-5xl">Your Cart</h1>
      <AfterHoursNotice className="mt-4" />
      <div className="mt-8 grid gap-8 pb-28 lg:mt-10 lg:grid-cols-[1fr_340px] lg:gap-10 lg:pb-0">
        <div className="space-y-4 sm:space-y-6">
          {items.map((item) => {
            const sizes = sizesByProduct.get(item.product_id) || [];
            return (
              <div
                key={item.id}
                className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:flex-row"
              >
                <div className="relative h-28 w-full overflow-hidden rounded-lg sm:h-24 sm:w-24">
                  <Image
                    src={item.product_image}
                    alt={item.product_name}
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-white">
                        {item.product_name}
                      </h2>
                      <p className="text-sm text-zinc-400">
                        {item.size} · {formatPrice(item.price, currency)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="flex h-10 w-10 items-center justify-center text-zinc-500 hover:text-red-400"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {sizes.length > 1 ? (
                    <div className="flex flex-wrap gap-1">
                      {sizes.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => changeSize(item.id, s)}
                          className={cn(
                            "rounded px-2 py-1 text-xs font-bold",
                            item.size_id === s.id
                              ? "bg-orange-500 text-black"
                              : "bg-zinc-800 text-zinc-400",
                          )}
                        >
                          {s.size}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-3">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() =>
                        updateQuantity(item.id, item.quantity - 1)
                      }
                    >
                      −
                    </Button>
                    <span className="w-6 text-center text-sm font-semibold">
                      {item.quantity}
                    </span>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() =>
                        updateQuantity(item.id, item.quantity + 1)
                      }
                    >
                      +
                    </Button>
                    <span className="ml-auto text-sm font-semibold text-orange-400">
                      {formatPrice(item.price * item.quantity, currency)}
                    </span>
                  </div>
                  <Textarea
                    placeholder="Special instructions for this item..."
                    value={item.special_instructions ?? ""}
                    onChange={(e) =>
                      updateInstructions(item.id, e.target.value)
                    }
                    className="min-h-[72px]"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <aside className="h-fit rounded-xl border border-zinc-800 bg-zinc-950 p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold text-white">Order Summary</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between text-zinc-400">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal, currency)}</span>
            </div>
            {discount > 0 ? (
              <div className="flex justify-between text-emerald-400">
                <span>{weekendPromoLabel(items) || "Promo discount"}</span>
                <span>-{formatPrice(discount, currency)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-zinc-400">
              <span>Delivery Charges</span>
              <span className="text-zinc-500">Calculated at checkout</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Cash on Delivery Fee</span>
              <span className="text-zinc-500">
                +{formatPrice(codFee, currency)} if COD
              </span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-semibold text-white">
              <span>Grand Total</span>
              <span className="text-orange-400">
                {formatPrice(payable, currency)}+
              </span>
            </div>
          </div>
          <div className="mt-6 hidden space-y-3 lg:block">
            <Button asChild className="w-full" size="lg">
              <Link href="/checkout">Checkout</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/checkout/guest">Guest Checkout</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/menu">Continue Shopping</Link>
            </Button>
          </div>
        </aside>

        <div className="fixed inset-x-0 bottom-0 z-40 space-y-2 border-t border-zinc-800 bg-black/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm lg:hidden">
          <Button asChild className="min-h-12 w-full" size="lg">
            <Link href="/checkout">
              Checkout · {formatPrice(payable, currency)}+
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link href="/checkout/guest">Guest Checkout</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
