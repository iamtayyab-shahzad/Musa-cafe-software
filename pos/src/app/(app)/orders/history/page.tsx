"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CancelOrderPasswordDialog } from "@/components/cancel-order-password-dialog";
import { printCustomerReceipt, ensureReceiptItemNames } from "@/lib/receipt";
import { cn, formatOrderItemsSummary, formatPrice, LAST_RECEIPT_KEY } from "@/lib/utils";
import { ordersApi, productsApi, settingsApi } from "@/services/api";
import type { Order } from "@/types";

export default function OrderHistoryPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: ordersApi.list,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
    staleTime: 5 * 60_000,
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: productsApi.list,
    staleTime: 5 * 60_000,
  });

  const showHistoryLoading = isLoading && orders.length === 0;

  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) map.set(p.id, p.name);
    return map;
  }, [products]);

  const filtered = useMemo(() => {
    return orders
      .filter((o) => (status === "all" ? true : o.order_status === status))
      .filter((o) => {
        if (!q) return true;
        const s = q.toLowerCase();
        const itemHit = (o.items || []).some((item) => {
          const name =
            item.product?.name ||
            item.product_name ||
            productNameById.get(item.product_id) ||
            "";
          return name.toLowerCase().includes(s);
        });
        return (
          o.customer_name.toLowerCase().includes(s) ||
          o.phone.includes(s) ||
          o.order_number.toLowerCase().includes(s) ||
          o.id.toLowerCase().includes(s) ||
          itemHit
        );
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  }, [orders, q, status, productNameById]);

  const complete = async (order: Order) => {
    try {
      await ordersApi.complete(order.id);
      toast.success("Order completed");
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const cancel = async (order: Order) => {
    try {
      await ordersApi.cancel(order.id);
      toast.success("Order cancelled");
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const reprint = (order: Order) => {
    const printable = ensureReceiptItemNames(order, productNameById);
    localStorage.setItem(LAST_RECEIPT_KEY, JSON.stringify(printable));
    void printCustomerReceipt(printable, settings || null, true).then(
      (printed) => {
        toast.message(
          printed
            ? "Receipt reprinted"
            : "Allow popups to reprint receipt",
        );
      },
    );
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <h1 className="mb-6 text-3xl font-black">Order History</h1>
      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          placeholder="Search name, phone, id, product..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {["all", "PENDING", "COMPLETED", "CANCELLED"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-bold",
              status === s ? "bg-orange-500 text-black" : "bg-zinc-900 text-zinc-400",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {showHistoryLoading ? (
        <p className="text-zinc-500">Loading...</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <div
              key={order.id}
              className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-lg font-bold">
                    {order.customer_name}{" "}
                    <span
                      className={cn(
                        "ml-2 rounded px-2 py-0.5 text-xs font-bold",
                        order.order_status === "COMPLETED" &&
                          "bg-emerald-500/20 text-emerald-400",
                        order.order_status === "PENDING" &&
                          "bg-orange-500/20 text-orange-400",
                        order.order_status === "CANCELLED" &&
                          "bg-red-500/20 text-red-400",
                      )}
                    >
                      {order.order_status}
                    </span>
                    {order.sync_status === "sync_failed" ? (
                      <span className="ml-2 rounded bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-300">
                        Sync failed
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-zinc-400">
                    {order.order_type} · {order.phone} · {order.payment_method} ·{" "}
                    {formatPrice(order.grand_total, settings?.currency)} ·{" "}
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {order.order_number} ·{" "}
                    {(order.items || []).length} item
                    {(order.items || []).length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-zinc-300">
                    {formatOrderItemsSummary(order, productNameById)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {order.order_status === "PENDING" && (
                    <>
                      <Button onClick={() => complete(order)}>Complete</Button>
                      <Button variant="danger" onClick={() => setCancelTarget(order)}>
                        Cancel
                      </Button>
                    </>
                  )}
                  <Button variant="outline" onClick={() => reprint(order)}>
                    Reprint
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {!filtered.length && (
            <p className="text-zinc-500">No orders found.</p>
          )}
        </div>
      )}
      <CancelOrderPasswordDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        onConfirm={() => {
          if (cancelTarget) void cancel(cancelTarget);
          setCancelTarget(null);
        }}
      />
    </div>
  );
}
