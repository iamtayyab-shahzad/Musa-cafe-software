"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Package,
  Receipt,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { shop } from "@/lib/shop";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import type { InventoryItem } from "@/lib/types";
import { formatPrice, formatStock } from "@/lib/utils";
import {
  analyticsApi,
  inventoryApi,
  ordersApi,
} from "@/services/api";

function stockTone(item: InventoryItem): "warning" | "danger" {
  if (item.currentStock < 0 || item.currentStock === 0) return "danger";
  return "warning";
}

function stockLabel(item: InventoryItem) {
  if (item.currentStock < 0) return "Negative";
  if (item.currentStock === 0) return "Out";
  return "Low";
}

function mapAlertItem(i: {
  id: string;
  name: string;
  category?: string;
  unit?: string;
  unit_kind?: string;
  purchase_unit?: string;
  units_per_purchase?: number;
  stock?: number;
  minimum_stock?: number;
  purchase_price?: number;
  avg_cost_micros?: number;
  supplier?: string;
  supplier_id?: string;
  is_active?: boolean;
}): InventoryItem {
  const stock = Number(i.stock || 0);
  const avg = Number(i.avg_cost_micros || 0);
  return {
    id: i.id,
    name: i.name,
    category: i.category || "",
    currentStock: stock,
    unit: i.unit || "g",
    unitKind: i.unit_kind || "WEIGHT",
    purchaseUnit: i.purchase_unit || i.unit || "KG",
    unitsPerPurchase: Number(i.units_per_purchase || 1) || 1,
    purchasePrice: Number(i.purchase_price || 0),
    avgCostMicros: avg,
    supplier: i.supplier || "",
    supplierId: i.supplier_id || "",
    minimumStock: Number(i.minimum_stock || 0),
    isActive: i.is_active !== false,
    stockValue: Math.round((Math.max(stock, 0) * avg) / 1_000_000),
  };
}

async function loadDashboard() {
  const [todaySales, weeklySales, monthlySales, orderRows, pendingRows, alertRows] =
    await Promise.all([
      analyticsApi.todaySales(),
      analyticsApi.weeklySales(),
      analyticsApi.monthlySales(),
      ordersApi.list({ limit: 10 }),
      ordersApi.pending(),
      inventoryApi.alerts(),
    ]);

  const negative = (alertRows.negative_stock || []).map(mapAlertItem);
  const out = (alertRows.out_of_stock || []).map(mapAlertItem);
  const low = (alertRows.low_stock || []).map(mapAlertItem);

  return {
    sales: {
      today: todaySales.total || 0,
      week: weeklySales.total || 0,
      month: monthlySales.total || 0,
    },
    recent: orderRows,
    pendingCount: pendingRows.length,
    alerts: {
      low: low.length,
      out: out.length,
      negative: negative.length,
    },
    alertItems: [...negative, ...out, ...low],
  };
}

export default function DashboardPage() {
  const { data, isError, error, isPending } = useQuery({
    queryKey: ["dashboard"],
    queryFn: loadDashboard,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isError) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load dashboard",
      );
    }
  }, [isError, error]);

  const sales = data?.sales ?? { today: 0, week: 0, month: 0 };
  const recent = data?.recent ?? [];
  const pendingCount = data?.pendingCount ?? 0;
  const alerts = data?.alerts ?? { low: 0, out: 0, negative: 0 };
  const alertItems = data?.alertItems ?? [];
  const alertCount = alerts.low + alerts.out + alerts.negative;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Today’s overview for ${shop.name}`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href="/profit-loss">
            <Receipt className="h-4 w-4" />
            Profit &amp; Loss
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href="/orders">
            <ShoppingBag className="h-4 w-4" />
            Orders
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's Sales"
          value={isPending ? "…" : formatPrice(sales.today)}
          hint="Completed orders"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Weekly Sales"
          value={isPending ? "…" : formatPrice(sales.week)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Monthly Sales"
          value={isPending ? "…" : formatPrice(sales.month)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Quick Stats"
          value={`${pendingCount} pending`}
          hint={`${alertCount} stock alerts`}
          icon={<ShoppingBag className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Recent Orders</h2>
            <Badge tone="orange">{recent.length} shown</Badge>
          </div>
          <div className="space-y-3">
            {recent.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-bold text-white">{order.order_number}</p>
                  <p className="truncate text-sm text-zinc-400">
                    {order.customer_name} ·{" "}
                    {(order.items || [])
                      .map(
                        (item) =>
                          `${item.quantity}× ${item.product?.name || "Item"}`,
                      )
                      .join(", ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-orange-400">
                    {formatPrice(order.grand_total)}
                  </p>
                  <Badge
                    tone={
                      order.order_status === "COMPLETED"
                        ? "success"
                        : order.order_status === "CANCELLED"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {order.order_status}
                  </Badge>
                </div>
              </div>
            ))}
            {!recent.length ? (
              <p className="text-zinc-400">
                {isPending ? "Loading…" : "No orders yet."}
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-bold">Stock Alerts</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {alerts.low > 0 ? (
                <Badge tone="warning">{alerts.low} low</Badge>
              ) : null}
              {alerts.out > 0 ? (
                <Badge tone="danger">{alerts.out} out</Badge>
              ) : null}
              {alerts.negative > 0 ? (
                <Badge tone="danger">{alerts.negative} negative</Badge>
              ) : null}
            </div>
          </div>
          {alertItems.length === 0 ? (
            <p className="text-zinc-400">
              {isPending ? "Loading…" : "All inventory levels look healthy."}
            </p>
          ) : (
            <div className="space-y-3">
              {alertItems.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Package className="h-4 w-4 text-amber-400" />
                    <div>
                      <p className="font-bold">{item.name}</p>
                      <p className="text-sm text-zinc-400">
                        Min{" "}
                        {formatStock(
                          item.minimumStock,
                          item.unit,
                          item.purchaseUnit,
                          item.unitsPerPurchase,
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge tone={stockTone(item)}>{stockLabel(item)}</Badge>
                    <p className="mt-1 font-black text-amber-400">
                      {formatStock(
                        item.currentStock,
                        item.unit,
                        item.purchaseUnit,
                        item.unitsPerPurchase,
                      )}
                    </p>
                  </div>
                </div>
              ))}
              {alertItems.length > 8 ? (
                <p className="text-center text-sm text-zinc-500">
                  Showing 8 of {alertItems.length} alerts — manage stock on the
                  POS Inventory screen.
                </p>
              ) : null}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
