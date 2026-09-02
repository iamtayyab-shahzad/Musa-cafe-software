"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CancelOrderPasswordDialog } from "@/components/cancel-order-password-dialog";
import { useBill } from "@/context/bill-context";
import {
  printCustomerReceipt,
  printKitchenReceipt,
  ensureReceiptItemNames,
  decodeKitchenInstructions,
  parseTableNumber,
  parseServiceMode,
} from "@/lib/receipt";
import {
  cn,
  formatOrderItemsSummary,
  formatPkPhone,
  formatPrice,
  LAST_RECEIPT_KEY,
  makeLineKey,
  WALKIN_LOCATION_ID,
} from "@/lib/utils";
import { karachiYmd, karachiDayBoundsUtc } from "@/lib/local-sales";
import { ordersApi, productsApi, settingsApi } from "@/services/api";
import type { Order, OrderType, PaymentMethod } from "@/types";

function toBillOrderType(type: string): OrderType {
  if (type === "phone") return "phone";
  if (type === "walkin") return "walkin";
  return "website";
}

export default function OrderHistoryPage() {
  const router = useRouter();
  const bill = useBill();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [dayYmd, setDayYmd] = useState(() => karachiYmd());
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

  const allowHistoryEdit = Boolean(settings?.pos_allow_history_edit);
  const showHistoryLoading = isLoading && orders.length === 0;

  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) map.set(p.id, p.name);
    return map;
  }, [products]);

  const filtered = useMemo(() => {
    const { startMs, endMs } = karachiDayBoundsUtc(dayYmd);
    const needle = q.trim().toLowerCase();
    const needleDigits = needle.replace(/\D/g, "");

    return orders
      .filter((o) => {
        const t = new Date(o.created_at).getTime();
        if (Number.isFinite(t)) return t >= startMs && t < endMs;
        return (o.business_date || "") === dayYmd;
      })
      .filter((o) => (status === "all" ? true : o.order_status === status))
      .filter((o) => {
        if (!needle) return true;
        const itemHit = (o.items || []).some((item) => {
          const name =
            item.product?.name ||
            item.product_name ||
            productNameById.get(item.product_id) ||
            "";
          return name.toLowerCase().includes(needle);
        });
        const dailyHit =
          o.daily_number != null &&
          (String(o.daily_number) === needle ||
            String(o.daily_number) === needleDigits ||
            `#${o.daily_number}` === needle);
        return (
          dailyHit ||
          o.customer_name.toLowerCase().includes(needle) ||
          o.phone.includes(needle) ||
          o.order_number.toLowerCase().includes(needle) ||
          o.id.toLowerCase().includes(needle) ||
          itemHit
        );
      })
      .sort((a, b) => {
        const da = a.daily_number || 0;
        const db = b.daily_number || 0;
        if (da && db && da !== db) return db - da;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
  }, [orders, q, status, productNameById, dayYmd]);

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

  const reprintCustomer = (order: Order) => {
    const printable = ensureReceiptItemNames(order, productNameById);
    localStorage.setItem(LAST_RECEIPT_KEY, JSON.stringify(printable));
    void printCustomerReceipt(printable, settings || null, true).then(
      (printed) => {
        toast.message(
          printed ? "Customer receipt reprinted" : "Allow popups to reprint",
        );
      },
    );
  };

  const reprintKitchen = (order: Order) => {
    void printKitchenReceipt(
      ensureReceiptItemNames(order, productNameById),
    ).then((printed) => {
      toast.message(
        printed ? "Kitchen receipt reprinted" : "Allow popups to reprint",
      );
    });
  };

  const edit = (order: Order) => {
    if (!allowHistoryEdit) {
      toast.error("History edit is disabled in restaurant settings");
      return;
    }
    if (order.order_status === "CANCELLED") {
      toast.error("Cancelled orders cannot be edited");
      return;
    }
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
    toast.message(
      `Editing #${order.daily_number || "?"} · ${order.order_number}`,
    );
    router.push("/orders/new");
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <h1 className="mb-2 text-3xl font-black">Order History</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Daily order numbers restart each day. Pick a date, then search by number
        (e.g. 12).
      </p>
      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          type="date"
          className="max-w-[11rem]"
          value={dayYmd}
          onChange={(e) => setDayYmd(e.target.value || karachiYmd())}
          title="Business day (Karachi)"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => setDayYmd(karachiYmd())}
        >
          Today
        </Button>
        <Input
          className="max-w-sm"
          placeholder="Search #12, name, phone, product…"
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
              status === s
                ? "bg-orange-500 text-black"
                : "bg-zinc-900 text-zinc-400",
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
                    {order.daily_number && order.daily_number > 0 ? (
                      <span className="mr-2 text-orange-400">
                        #{order.daily_number}
                      </span>
                    ) : null}
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
                    {order.order_type} · {order.phone} · {order.payment_method}{" "}
                    · {formatPrice(order.grand_total, settings?.currency)} ·{" "}
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {order.order_number} · {(order.items || []).length} item
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
                      <Button
                        variant="danger"
                        onClick={() => setCancelTarget(order)}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                  {allowHistoryEdit && order.order_status !== "CANCELLED" ? (
                    <Button variant="secondary" onClick={() => edit(order)}>
                      Edit
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    onClick={() => reprintKitchen(order)}
                  >
                    Kitchen
                  </Button>
                  <Button variant="outline" onClick={() => reprintCustomer(order)}>
                    Reprint
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {!filtered.length && (
            <p className="text-zinc-500">No orders found for this day.</p>
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
