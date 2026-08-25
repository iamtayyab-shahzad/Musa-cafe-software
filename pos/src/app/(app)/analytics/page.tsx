"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatPrice, formatStock } from "@/lib/utils";
import { analyticsApi, settingsApi } from "@/services/api";

type PeriodResult = {
  total: number;
  order_count: number;
  from: string;
  to: string;
};

type InventoryRow = {
  id: string;
  name: string;
  unit: string;
  purchase_unit?: string;
  units_per_purchase?: number;
  stock: number;
  minimum_stock: number;
  category?: string;
};

function stockStatus(item: InventoryRow) {
  if (item.stock < 0)
    return { label: "Negative", className: "bg-red-600/20 text-red-400" };
  if (item.stock === 0)
    return { label: "Out", className: "bg-red-600/20 text-red-400" };
  if (item.stock <= item.minimum_stock)
    return { label: "Low", className: "bg-amber-500/20 text-amber-400" };
  return { label: "OK", className: "bg-emerald-500/20 text-emerald-400" };
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AnalyticsPage() {
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
  });
  const currency = settings?.currency || "Rs";

  const { data: today } = useQuery({
    queryKey: ["analytics", "today"],
    queryFn: analyticsApi.todaySales,
    staleTime: 0,
  });
  const { data: weekly } = useQuery({
    queryKey: ["analytics", "weekly"],
    queryFn: analyticsApi.weeklySales,
    staleTime: 0,
  });
  const { data: monthly } = useQuery({
    queryKey: ["analytics", "monthly"],
    queryFn: analyticsApi.monthlySales,
    staleTime: 0,
  });
  const { data: best = [] } = useQuery({
    queryKey: ["analytics", "best"],
    queryFn: analyticsApi.bestSelling,
  });
  const { data: payments = [] } = useQuery({
    queryKey: ["analytics", "payments"],
    queryFn: analyticsApi.paymentBreakdown,
  });
  const { data: inventory = [] } = useQuery({
    queryKey: ["analytics", "inventory"],
    queryFn: analyticsApi.remainingInventory,
  });
  const { data: cancelled } = useQuery({
    queryKey: ["analytics", "cancelled"],
    queryFn: analyticsApi.cancelled,
  });

  const inventoryRows = (Array.isArray(inventory) ? inventory : []) as InventoryRow[];
  const attentionItems = inventoryRows.filter(
    (i) => i.stock <= i.minimum_stock || i.stock < 0,
  );
  const okCount = inventoryRows.length - attentionItems.length;

  const [mode, setMode] = useState<"day" | "range">("day");
  const [day, setDay] = useState(todayIso);
  const [from, setFrom] = useState(todayIso);
  const [to, setTo] = useState(todayIso);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookup, setLookup] = useState<PeriodResult | null>(null);
  const [reconBusy, setReconBusy] = useState(false);
  const [recon, setRecon] = useState<Awaited<
    ReturnType<typeof analyticsApi.reconcileDay>
  > | null>(null);

  const runReconcile = async () => {
    setReconBusy(true);
    try {
      setRecon(await analyticsApi.reconcileDay(day));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Compare failed");
    } finally {
      setReconBusy(false);
    }
  };

  const runLookup = async () => {
    setLookupBusy(true);
    try {
      const result =
        mode === "day"
          ? await analyticsApi.salesForPeriod({ date: day })
          : await analyticsApi.salesForPeriod({ from, to });
      setLookup(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load sales");
    } finally {
      setLookupBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <h1 className="mb-6 text-3xl font-black">Analytics</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card title="Today" value={formatPrice(today?.total || 0, currency)} />
        <Card title="Weekly" value={formatPrice(weekly?.total || 0, currency)} />
        <Card
          title="Monthly"
          value={formatPrice(monthly?.total || 0, currency)}
        />
        <Card title="Cancelled" value={String(cancelled?.count || 0)} />
      </div>

      <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="mb-1 text-xl font-bold">Till vs cloud</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Compare this PC&apos;s completed sales for a Pakistan calendar day
          against the server. A mismatch usually means unsynced orders or a
          delay — it does not change Today&apos;s Sales on the till.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[12rem]">
            <span className="mb-1 block text-xs text-zinc-500">Date</span>
            <Input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <Button onClick={() => void runReconcile()} disabled={reconBusy}>
            {reconBusy ? "Comparing..." : "Compare till vs cloud"}
          </Button>
        </div>
        {recon ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Card
              title={`Till ${recon.date}`}
              value={`${recon.local_count} · ${formatPrice(recon.local_total, currency)}`}
            />
            <Card
              title="Cloud"
              value={
                recon.cloud_total == null
                  ? "Offline / unavailable"
                  : `${recon.cloud_count} · ${formatPrice(recon.cloud_total, currency)}`
              }
            />
            <Card
              title="Match"
              value={
                recon.cloud_total == null
                  ? "—"
                  : recon.matched
                    ? "Yes"
                    : "No — check Sync"
              }
            />
          </div>
        ) : null}
      </section>

      <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="mb-1 text-xl font-bold">Sales lookup</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Pick one day or a date range (Pakistan time, midnight to midnight).
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("day")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-bold",
              mode === "day"
                ? "bg-orange-500 text-black"
                : "bg-zinc-900 text-zinc-400",
            )}
          >
            Single day
          </button>
          <button
            type="button"
            onClick={() => setMode("range")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-bold",
              mode === "range"
                ? "bg-orange-500 text-black"
                : "bg-zinc-900 text-zinc-400",
            )}
          >
            Date range
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {mode === "day" ? (
            <label className="block min-w-[12rem] flex-1">
              <span className="mb-1 block text-xs text-zinc-500">Date</span>
              <Input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
          ) : (
            <>
              <label className="block min-w-[12rem] flex-1">
                <span className="mb-1 block text-xs text-zinc-500">From</span>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="block min-w-[12rem] flex-1">
                <span className="mb-1 block text-xs text-zinc-500">To</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </>
          )}
          <Button onClick={() => void runLookup()} disabled={lookupBusy}>
            {lookupBusy ? "Loading..." : "Get sales"}
          </Button>
        </div>
        {lookup ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Card
              title={
                lookup.from === lookup.to
                  ? `Sales on ${lookup.from}`
                  : `Sales ${lookup.from} → ${lookup.to}`
              }
              value={formatPrice(lookup.total, currency)}
            />
            <Card title="Completed orders" value={String(lookup.order_count)} />
            <Card
              title="Period"
              value={
                lookup.from === lookup.to
                  ? lookup.from
                  : `${lookup.from} → ${lookup.to}`
              }
            />
          </div>
        ) : null}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="mb-4 text-xl font-bold">Top Selling Products</h2>
          <div className="space-y-2">
            {best.map((row, i) => (
              <div
                key={i}
                className="flex justify-between rounded-lg bg-black/40 px-3 py-2 text-sm"
              >
                <span>
                  {String(
                    row.name ||
                      row.product_name ||
                      row.Name ||
                      `Product ${i + 1}`,
                  )}
                </span>
                <span className="text-orange-400">
                  {String(row.total_qty || row.quantity || row.count || "-")}
                </span>
              </div>
            ))}
            {!best.length && (
              <p className="text-zinc-500">No sales data yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="mb-4 text-xl font-bold">Payment Breakdown</h2>
          <div className="space-y-2">
            {payments.map((row, i) => (
              <div
                key={i}
                className="flex justify-between rounded-lg bg-black/40 px-3 py-2 text-sm"
              >
                <span className="capitalize">
                  {String(row.payment_method || row.method || "-")}
                </span>
                <span className="text-orange-400">
                  {formatPrice(Number(row.total || row.amount || 0), currency)}
                </span>
              </div>
            ))}
            {!payments.length && (
              <p className="text-zinc-500">No payment data yet.</p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">Inventory Summary</h2>
            <p className="text-sm text-zinc-400">
              {inventoryRows.length} items · {attentionItems.length} need
              attention · {okCount} OK
            </p>
          </div>
        </div>
        {!inventoryRows.length ? (
          <p className="text-zinc-500">No inventory items yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-900/80 text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold">Stock</th>
                  <th className="px-3 py-2 font-semibold">Min</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {(attentionItems.length ? attentionItems : inventoryRows)
                  .slice(0, 30)
                  .map((item) => {
                    const status = stockStatus(item);
                    return (
                      <tr
                        key={item.id}
                        className="border-t border-zinc-800"
                      >
                        <td className="px-3 py-2 font-semibold text-white">
                          {item.name}
                          {item.category ? (
                            <span className="mt-0.5 block text-xs font-normal text-zinc-500">
                              {item.category}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-zinc-200">
                          {formatStock(
                            item.stock,
                            item.unit,
                            item.purchase_unit,
                            item.units_per_purchase,
                          )}
                        </td>
                        <td className="px-3 py-2 text-zinc-400">
                          {formatStock(
                            item.minimum_stock,
                            item.unit,
                            item.purchase_unit,
                            item.units_per_purchase,
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 text-xs font-bold",
                              status.className,
                            )}
                          >
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {attentionItems.length === 0 ? (
              <p className="border-t border-zinc-800 px-3 py-2 text-xs text-emerald-400">
                All stock levels look fine.
              </p>
            ) : attentionItems.length > 30 ? (
              <p className="border-t border-zinc-800 px-3 py-2 text-xs text-zinc-500">
                Showing first 30 of {attentionItems.length} items needing
                attention. Open Inventory for the full list.
              </p>
            ) : (
              <p className="border-t border-zinc-800 px-3 py-2 text-xs text-zinc-500">
                Showing items that are low, out, or negative.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-2 text-3xl font-black text-orange-400">{value}</p>
    </div>
  );
}
