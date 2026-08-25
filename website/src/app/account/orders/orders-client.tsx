"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useCart } from "@/context/cart-context";
import { formatPrice } from "@/lib/utils";
import { getMyOrders } from "@/services/api";
import type { Order, OrderItem, Product, ProductSize } from "@/types";

function itemLabel(item: OrderItem) {
  const name = item.product?.name || "Item";
  const size = item.product_size?.size;
  return size ? `${name} (${size})` : name;
}

function toProduct(item: OrderItem): Product | null {
  if (!item.product_id) return null;
  const p = item.product;
  return {
    id: item.product_id,
    category_id: p?.category_id || "",
    name: p?.name || "Item",
    description: p?.description || "",
    image: p?.image || "/logo.png",
    featured: false,
    available: p?.available !== false,
    display_order: 0,
    sizes: p?.sizes || (item.product_size ? [item.product_size] : []),
    category: p?.category,
  };
}

function toSize(item: OrderItem): ProductSize | null {
  if (item.product_size?.id) return item.product_size;
  if (!item.product_size_id) return null;
  return {
    id: item.product_size_id,
    product_id: item.product_id,
    size: "Regular",
    price: item.price,
  };
}

export default function MyOrdersClient() {
  const router = useRouter();
  const { isAuthenticated, customer } = useAuth();
  const { addItem, clearCart } = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getMyOrders(5)
      .then((rows) => {
        if (active) setOrders(rows);
      })
      .catch((e) => {
        if (active) {
          toast.error(e instanceof Error ? e.message : "Could not load orders");
          setOrders([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  const reorder = useCallback(
    (order: Order, editInCart: boolean) => {
      const lines = order.items || [];
      if (!lines.length) {
        toast.error("This order has no items to reorder");
        return;
      }
      clearCart();
      let added = 0;
      for (const line of lines) {
        const product = toProduct(line);
        const size = toSize(line);
        if (!product || !size || product.available === false) continue;
        addItem(
          product,
          size,
          line.quantity,
          line.special_instructions || undefined,
        );
        added += 1;
      }
      if (!added) {
        toast.error("Those items are no longer available");
        return;
      }
      toast.success(
        editInCart
          ? "Items loaded — change anything in your cart, then checkout"
          : "Same items added — go to checkout when ready",
      );
      router.push(editInCart ? "/cart" : "/checkout");
    },
    [addItem, clearCart, router],
  );

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-5xl text-white">My Orders</h1>
        <p className="mt-3 text-zinc-400">
          Login to see your recent orders and order the same again.
        </p>
        <Button asChild className="mt-8">
          <Link href="/login?redirect=/account/orders">Login</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display text-4xl text-white sm:text-5xl">My Orders</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Hi {customer?.name || ""} — your latest order and up to 4 older ones.
        Order again, or load into cart to change sizes before checkout.
      </p>

      {loading ? (
        <p className="mt-10 text-zinc-500">Loading orders...</p>
      ) : orders.length === 0 ? (
        <div className="mt-10 rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <p className="text-zinc-400">No orders yet while logged in.</p>
          <Button asChild className="mt-6">
            <Link href="/menu">Browse Menu</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {orders.map((order, index) => {
            const names = (order.items || [])
              .slice(0, 4)
              .map(itemLabel)
              .join(", ");
            const extra =
              (order.items?.length || 0) > 4
                ? ` +${(order.items?.length || 0) - 4} more`
                : "";
            return (
              <li
                key={order.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">
                      {order.order_number || order.id.slice(0, 8)}
                      {index === 0 ? (
                        <span className="ml-2 rounded bg-orange-500/20 px-2 py-0.5 text-xs font-bold text-orange-300">
                          Latest
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {new Date(order.created_at).toLocaleString("en-PK")} ·{" "}
                      {order.order_status}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-orange-400">
                    {formatPrice(order.grand_total)}
                  </p>
                </div>
                <p className="mt-3 text-sm text-zinc-300">
                  {names}
                  {extra}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => reorder(order, false)}
                  >
                    Order again
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => reorder(order, true)}
                  >
                    Edit in cart
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
