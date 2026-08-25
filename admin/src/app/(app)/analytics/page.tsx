"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatPrice } from "@/lib/utils";
import {
  analyticsApi,
  type AnalyticsBestSellingRow,
  type AnalyticsInventoryRow,
  type AnalyticsPaymentRow,
  type AnalyticsSalesPeriod,
} from "@/services/api";

type AnalyticsState = {
  todaySales: number;
  yesterdaySales: number;
  weeklySales: number;
  monthlySales: number;
  cancelledOrders: number;
  bestSelling: AnalyticsBestSellingRow[];
  paymentBreakdown: AnalyticsPaymentRow[];
  lowStock: AnalyticsInventoryRow[];
};

const emptyAnalytics: AnalyticsState = {
  todaySales: 0,
  yesterdaySales: 0,
  weeklySales: 0,
  monthlySales: 0,
  cancelledOrders: 0,
  bestSelling: [],
  paymentBreakdown: [],
  lowStock: [],
};

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsState>(emptyAnalytics);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<"day" | "range">("day");
  const [day, setDay] = useState(todayIso);
  const [from, setFrom] = useState(todayIso);
  const [to, setTo] = useState(todayIso);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookup, setLookup] = useState<AnalyticsSalesPeriod | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const settled = await Promise.allSettled([
          analyticsApi.todaySales(),
          analyticsApi.yesterdaySales(),
          analyticsApi.weeklySales(),
          analyticsApi.monthlySales(),
          analyticsApi.bestSellingProducts(),
          analyticsApi.cancelledOrders(),
          analyticsApi.paymentBreakdown(),
          analyticsApi.lowStock(),
        ]);
        if (cancelled) return;

        const val = <T,>(i: number, fallback: T): T => {
          const r = settled[i];
          return r.status === "fulfilled" ? (r.value as T) : fallback;
        };
        const today = val<{ total: number }>(0, { total: 0 });
        const yesterday = val<{ total: number }>(1, { total: 0 });
        const weekly = val<{ total: number }>(2, { total: 0 });
        const monthly = val<{ total: number }>(3, { total: 0 });
        const bestSelling = val<AnalyticsBestSellingRow[]>(4, []);
        const cancelledCount = val<{ count: number }>(5, { count: 0 });
        const payment = val<AnalyticsPaymentRow[]>(6, []);
        const lowStock = val<AnalyticsInventoryRow[]>(7, []);

        const failed = settled.filter((s) => s.status === "rejected").length;
        setData({
          todaySales: Number(today?.total ?? 0),
          yesterdaySales: Number(yesterday?.total ?? 0),
          weeklySales: Number(weekly?.total ?? 0),
          monthlySales: Number(monthly?.total ?? 0),
          cancelledOrders: Number(cancelledCount?.count ?? 0),
          bestSelling: Array.isArray(bestSelling) ? bestSelling : [],
          paymentBreakdown: Array.isArray(payment) ? payment : [],
          lowStock: Array.isArray(lowStock) ? lowStock : [],
        });
        if (failed === settled.length) {
          toast.error("Failed to load analytics — check login / backend");
        } else if (failed > 0) {
          toast.message(`Analytics partially loaded (${failed} requests failed)`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load analytics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-zinc-400">
        Loading analytics...
      </div>
    );
  }

  const maxPayment = Math.max(
    1,
    ...data.paymentBreakdown.map((p) => Number(p.total || 0)),
  );
  const maxSold = Math.max(
    1,
    ...data.bestSelling.map((p) => Number(p.quantity || 0)),
  );

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Sales performance, payments, and stock insights"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Today's Sales"
          value={formatPrice(data.todaySales)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Yesterday's Sales"
          value={formatPrice(data.yesterdaySales)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Weekly Sales"
          value={formatPrice(data.weeklySales)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Monthly Sales"
          value={formatPrice(data.monthlySales)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Cancelled Orders"
          value={String(data.cancelledOrders)}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      <Card className="mt-6">
        <h2 className="mb-1 text-lg font-bold">Cloud sales lookup</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Server completed sales for a Pakistan calendar day. Compare against
          the shop POS Analytics → Till vs cloud on the cashier PC.
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
          <div className="mt-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label={
                  lookup.from === lookup.to
                    ? `Sales on ${lookup.from}`
                    : `Sales ${lookup.from} → ${lookup.to}`
                }
                value={formatPrice(lookup.total)}
                icon={<TrendingUp className="h-5 w-5" />}
              />
              <StatCard
                label="Completed orders"
                value={String(lookup.order_count)}
                icon={<TrendingUp className="h-5 w-5" />}
              />
              <StatCard
                label="Period"
                value={
                  lookup.from === lookup.to
                    ? lookup.from
                    : `${lookup.from} → ${lookup.to}`
                }
                icon={<TrendingUp className="h-5 w-5" />}
              />
            </div>

            <div>
              <h3 className="mb-3 text-base font-bold">
                {lookup.from === lookup.to
                  ? `Items sold on ${lookup.from}`
                  : `Items sold ${lookup.from} → ${lookup.to}`}
              </h3>
              {!lookup.items?.length ? (
                <p className="text-sm text-zinc-400">
                  No completed item sales in this period.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="bg-zinc-950 text-xs uppercase text-zinc-500">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2 text-right">Qty sold</th>
                        <th className="px-3 py-2 text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lookup.items.map((item, idx) => (
                        <tr
                          key={item.product_id || `${item.product_name}-${idx}`}
                          className="border-t border-zinc-800"
                        >
                          <td className="px-3 py-2 text-zinc-500">{idx + 1}</td>
                          <td className="px-3 py-2 font-semibold">
                            {item.product_name || "Unknown product"}
                          </td>
                          <td className="px-3 py-2 text-right text-orange-400">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {formatPrice(Number(item.revenue || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-zinc-700 bg-zinc-950/80">
                        <td className="px-3 py-2" colSpan={2}>
                          <span className="font-bold">Total units</span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-orange-400">
                          {lookup.items.reduce(
                            (s, i) => s + Number(i.quantity || 0),
                            0,
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-bold">
                          {formatPrice(
                            lookup.items.reduce(
                              (s, i) => s + Number(i.revenue || 0),
                              0,
                            ),
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-bold">Best Selling Products</h2>
          {data.bestSelling.length === 0 ? (
            <p className="text-zinc-400">No completed sales yet.</p>
          ) : (
            <div className="space-y-4">
              {data.bestSelling.map((item) => (
                <div key={item.product_id || item.product_name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold">
                      {item.product_name || "Unknown product"}
                    </span>
                    <span className="text-orange-400">
                      {item.quantity} sold
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-orange-500"
                      style={{
                        width: `${(Number(item.quantity || 0) / maxSold) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-bold">Payment Breakdown</h2>
          {data.paymentBreakdown.length === 0 ? (
            <p className="text-zinc-400">No paid payments yet.</p>
          ) : (
            <div className="space-y-4">
              {data.paymentBreakdown.map((item) => (
                <div key={item.method}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold">{item.method}</span>
                    <span className="text-orange-400">
                      {formatPrice(Number(item.total || 0))}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-orange-400"
                      style={{
                        width: `${(Number(item.total || 0) / maxPayment) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <h2 className="text-lg font-bold">Low Stock Summary</h2>
        </div>
        {data.lowStock.length === 0 ? (
          <p className="text-zinc-400">No low stock items right now.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.lowStock.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3"
              >
                <p className="font-bold">{item.name}</p>
                <p className="text-sm text-zinc-400">
                  {item.stock} / min {item.minimum_stock} {item.unit}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
