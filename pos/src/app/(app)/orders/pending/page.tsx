"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CancelOrderPasswordDialog } from "@/components/cancel-order-password-dialog";
import { useBill } from "@/context/bill-context";
import {
  cn,
  formatPkPhone,
  formatPrice,
  makeLineKey,
  WALKIN_LOCATION_ID,
} from "@/lib/utils";
import {
  printCustomerReceipt,
  printKitchenReceipt,
  decodeKitchenInstructions,
  parseTableNumber,
  parseServiceMode,
  stripTableFromNotes,
  kitchenOrderTypeLabel,
  ensureReceiptItemNames,
} from "@/lib/receipt";
import { ordersApi, productsApi, settingsApi } from "@/services/api";
import { isOnline } from "@/lib/network";
import { getSyncState } from "@/lib/sync-engine";
import { ordersShareIdentity } from "@/lib/order-identity";
import { isPizzaSizeLabel } from "@/lib/is-pizza";
import type { Order, OrderType, PaymentMethod } from "@/types";

type FilterType = "all" | "website" | "phone" | "walkin";

function typeLabel(type: string) {
  if (type === "website" || type === "guest") return "Website";
  if (type === "phone") return "Phone";
  if (type === "walkin") return "Walk-in";
  return type;
}

function typeTone(type: string) {
  if (type === "website" || type === "guest")
    return "bg-sky-500/20 text-sky-300 border-sky-500/40";
  if (type === "phone")
    return "bg-violet-500/20 text-violet-300 border-violet-500/40";
  return "bg-zinc-700/40 text-zinc-300 border-zinc-600";
}

function matchesFilter(order: Order, filter: FilterType) {
  if (filter === "all") return true;
  if (filter === "website")
    return order.order_type === "website" || order.order_type === "guest";
  return order.order_type === filter;
}

function toBillOrderType(type: string): OrderType {
  if (type === "phone") return "phone";
  if (type === "walkin") return "walkin";
  return "website";
}

export default function PendingOrdersPage() {
  const router = useRouter();
  const bill = useBill();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterType>("all");
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

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

  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) map.set(p.id, p.name);
    return map;
  }, [products]);

  const { data: orders = [], isLoading, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ["orders", "pending"],
    queryFn: ordersApi.pending,
    refetchInterval: () => {
      if (typeof document !== "undefined" && document.hidden) return false;
      // Offline / unreachable: rely on IndexedDB + POS_ORDERS_CHANGED_EVENT.
      if (!isOnline()) return false;
      if (getSyncState().syncing) return false;
      return 5_000;
    },
    refetchOnWindowFocus: true,
    staleTime: 2_000,
  });

  const showPendingLoading = isLoading && orders.length === 0;

  const filtered = useMemo(
    () =>
      orders
        .filter((o) => matchesFilter(o, filter))
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
    [orders, filter],
  );

  const counts = useMemo(() => {
    const website = orders.filter(
      (o) => o.order_type === "website" || o.order_type === "guest",
    ).length;
    const phone = orders.filter((o) => o.order_type === "phone").length;
    const walkin = orders.filter((o) => o.order_type === "walkin").length;
    return { all: orders.length, website, phone, walkin };
  }, [orders]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["orders", "pending"] }),
      queryClient.invalidateQueries({ queryKey: ["orders"] }),
    ]);
  };

  const printableOrder = (order: Order) =>
    ensureReceiptItemNames(order, productNameById);

  const complete = (order: Order) => {
    // Optimistic: remove every twin identity + print immediately.
    queryClient.setQueryData<Order[]>(["orders", "pending"], (old) =>
      (old || []).filter((o) => !ordersShareIdentity(o, order)),
    );
    void printCustomerReceipt(
      { ...printableOrder(order), order_status: "COMPLETED" },
      settings || null,
    ).then((printed) => {
      toast.success(
        printed
          ? "Order completed — customer receipt printed"
          : "Order completed — allow popups to print receipt",
      );
    });
    void ordersApi
      .complete(order.id)
      .then(() => {
        void refresh();
      })
      .catch((error) => {
        void refresh();
        toast.error(
          error instanceof Error ? error.message : "Failed to complete order",
        );
      });
  };

  const reprintKitchen = (order: Order) => {
    void printKitchenReceipt(printableOrder(order)).then((printed) => {
      toast.message(
        printed
          ? "Kitchen receipt sent to printer"
          : "Allow popups to print kitchen receipt",
      );
    });
  };

  const cancel = (order: Order) => {
    queryClient.setQueryData<Order[]>(["orders", "pending"], (old) =>
      (old || []).filter((o) => !ordersShareIdentity(o, order)),
    );
    toast.success("Order cancelled");
    void ordersApi
      .cancel(order.id)
      .then(() => {
        void refresh();
      })
      .catch((error) => {
        void refresh();
        toast.error(
          error instanceof Error ? error.message : "Failed to cancel order",
        );
      });
  };

  const edit = (order: Order) => {
    const orderType = toBillOrderType(order.order_type);
    const items = (order.items || []).map((item) => {
      const meta = decodeKitchenInstructions(item.special_instructions);
      return {
        key: makeLineKey(
          item.product_id,
          item.product_size_id,
          meta.notes || undefined,
        ),
        product_id: item.product_id,
        product_name:
          item.product?.name ||
          (item as { product_name?: string }).product_name ||
          "Item",
        product_image: item.product?.image || "",
        size_id: item.product_size_id,
        size:
          item.product_size?.size ||
          (item as { size?: string }).size ||
          "",
        price: item.price,
        quantity: item.quantity,
        special_instructions: meta.notes || "",
        crust: meta.crust,
        toppings: meta.toppings,
        extras: meta.extras,
      };
    });
    bill.loadDraft({
      draftId: null,
      editingOrderId: order.id,
      orderType,
      customerName: order.customer_name,
      phone: formatPkPhone(order.phone),
      address: order.address || "",
      locationId: order.location_id || WALKIN_LOCATION_ID,
      deliveryCharge: order.delivery_charge || 0,
      paymentMethod: order.payment_method as PaymentMethod,
      orderNotes: "",
      tableNumber: parseTableNumber(order.order_notes),
      serviceMode: parseServiceMode(order.order_notes),
      items,
    });
    toast.message(`Editing ${order.order_number}`);
    router.push("/orders/new");
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Pending Orders</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Website, phone, and walk-in orders waiting to be prepared.
            Auto-refreshes while this tab is open.
            {dataUpdatedAt
              ? ` · Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}`
              : ""}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => refresh()}
          disabled={isFetching}
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ["all", "All", counts.all],
            ["website", "Website", counts.website],
            ["phone", "Phone", counts.phone],
            ["walkin", "Walk-in", counts.walkin],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-bold",
              filter === id
                ? "bg-orange-500 text-black"
                : "bg-zinc-900 text-zinc-400",
            )}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((order) => {
          const items = order.items || [];
          return (
            <div
              key={order.id}
              className={cn(
                "rounded-xl border bg-zinc-950 p-4",
                order.order_type === "website" || order.order_type === "guest"
                  ? "border-sky-500/50"
                  : "border-zinc-800",
              )}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-bold text-white">
                      {order.order_number}
                    </p>
                    {(order.order_number.startsWith("LOCAL-") ||
                      order.sync_status === "pending_sync" ||
                      order.sync_status === "sync_failed") && (
                      <span
                        className={
                          order.sync_status === "sync_failed"
                            ? "rounded border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-300"
                            : "rounded border border-orange-500/40 bg-orange-500/15 px-2 py-0.5 text-xs font-bold text-orange-300"
                        }
                      >
                        {order.sync_status === "sync_failed"
                          ? "Sync failed"
                          : "Pending sync"}
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded border px-2 py-0.5 text-xs font-bold uppercase",
                        typeTone(order.order_type),
                      )}
                    >
                      {typeLabel(order.order_type)}
                    </span>
                    <span className="rounded bg-orange-500/20 px-2 py-0.5 text-xs font-bold text-orange-300">
                      PENDING
                    </span>
                  </div>
                  <p className="font-semibold text-zinc-200">
                    {order.customer_name}
                    {order.phone && order.phone !== "0000000000"
                      ? ` · ${order.phone}`
                      : ""}
                  </p>
                  {(order.order_type === "website" ||
                    order.order_type === "guest" ||
                    order.order_type === "phone") && (
                    <p className="text-sm text-zinc-400">
                      {order.address || "No address"}
                    </p>
                  )}
                  <p className="text-sm text-zinc-400">
                    Pay:{" "}
                    <span className="font-semibold text-zinc-200">
                      {order.payment_method.toUpperCase()}
                    </span>
                    {" · "}
                    {formatPrice(order.grand_total)}
                    {" · "}
                    {items.length} item{items.length === 1 ? "" : "s"}
                  </p>
                  {order.order_type === "walkin" ? (
                    <p className="text-sm font-semibold text-orange-300">
                      {kitchenOrderTypeLabel(order.order_type, order.order_notes)}
                      {parseTableNumber(order.order_notes)
                        ? ` · Table ${parseTableNumber(order.order_notes)}`
                        : ""}
                    </p>
                  ) : null}
                  {stripTableFromNotes(order.order_notes) ? (
                    <p className="text-sm text-amber-300/90">
                      Note: {stripTableFromNotes(order.order_notes)}
                    </p>
                  ) : null}
                  <ul className="mt-1 space-y-1 rounded-lg border border-zinc-800 bg-black/30 p-3 text-sm text-zinc-300">
                    {items.map((item, idx) => (
                      <li
                        key={item.id || `${order.id}-item-${idx}`}
                        className="flex justify-between gap-3"
                      >
                        <span>
                          {item.quantity}×                           {item.product?.name || "Item"}
                          {isPizzaSizeLabel(item.product_size?.size)
                            ? ` (${item.product_size?.size})`
                            : ""}
                          {item.special_instructions
                            ? ` — ${item.special_instructions}`
                            : ""}
                        </span>
                        <span className="shrink-0 text-zinc-500">
                          {formatPrice(item.price * item.quantity)}
                        </span>
                      </li>
                    ))}
                    {!items.length && (
                      <li className="text-zinc-500">No item details</li>
                    )}
                  </ul>
                  <p className="text-xs text-zinc-600">
                    Created {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => edit(order)}>
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => reprintKitchen(order)}
                  >
                    Kitchen
                  </Button>
                  <Button onClick={() => complete(order)}>Complete</Button>
                  <Button variant="danger" onClick={() => setCancelTarget(order)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {showPendingLoading ? (
          <p className="text-zinc-500">Loading pending orders...</p>
        ) : !filtered.length ? (
          <p className="text-zinc-500">
            {filter === "all"
              ? "No pending orders."
              : `No pending ${filter} orders.`}
          </p>
        ) : null}
      </div>
      <CancelOrderPasswordDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        onConfirm={() => {
          if (cancelTarget) cancel(cancelTarget);
          setCancelTarget(null);
        }}
      />
    </div>
  );
}
