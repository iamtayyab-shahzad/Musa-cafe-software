"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import {
  analyticsApi,
  inventoryApi,
  ordersApi,
  settingsApi,
} from "@/services/api";
import { listSyncFailedOrders } from "@/lib/offline-db";

export default function DashboardPage() {
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
  });
  const { data: today } = useQuery({
    queryKey: ["analytics", "today"],
    queryFn: analyticsApi.todaySales,
    staleTime: 0,
  });
  const { data: recon } = useQuery({
    queryKey: ["analytics", "reconcile-today"],
    queryFn: () => analyticsApi.reconcileDay(),
    staleTime: 30_000,
    retry: false,
  });
  const { data: weekly } = useQuery({
    queryKey: ["analytics", "weekly"],
    queryFn: analyticsApi.weeklySales,
    staleTime: 0,
  });
  const { data: pendingOrders = [] } = useQuery({
    queryKey: ["orders", "pending"],
    queryFn: ordersApi.pending,
  });
  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: inventoryApi.list,
  });
  const { data: failedOrders = [] } = useQuery({
    queryKey: ["orders", "sync-failed"],
    queryFn: listSyncFailedOrders,
    staleTime: 5_000,
  });

  const currency = settings?.currency || "Rs";
  const pending = pendingOrders.length;
  const lowStock = inventory.filter((i) => i.stock <= i.minimum_stock).length;
  const failedCount = failedOrders.length;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-black sm:text-3xl">Dashboard</h1>
        <Button asChild size="lg">
          <Link href="/orders/new">Start New Order</Link>
        </Button>
      </div>
      {failedCount > 0 ? (
        <div className="mb-4 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-bold text-red-300">
            {failedCount} order{failedCount === 1 ? "" : "s"} failed to sync to
            the cloud — they still look completed on this till.
          </p>
          <p className="mt-1 text-xs text-red-200/80">
            Open Settings → Failed sync items → Retry all. Do not assume the
            office PC has these tickets until sync succeeds.
          </p>
          <Button asChild size="sm" className="mt-3" variant="secondary">
            <Link href="/settings">Open Settings</Link>
          </Button>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label="Today's Sales"
          value={formatPrice(today?.total || 0, currency)}
        />
        <Stat
          label="Weekly Sales"
          value={formatPrice(weekly?.total || 0, currency)}
        />
        <Stat label="Pending Orders" value={String(pending)} />
        <Stat label="Low Stock Items" value={String(lowStock)} warn={lowStock > 0} />
        <Stat
          label="Sync failed"
          value={String(failedCount)}
          warn={failedCount > 0}
        />
      </div>
      {recon &&
      recon.cloud_total != null &&
      recon.matched === false ? (
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Till today ({recon.local_count} orders,{" "}
          {formatPrice(recon.local_total, currency)}) does not match cloud (
          {recon.cloud_count} orders, {formatPrice(recon.cloud_total, currency)}
          ). Open Analytics to compare. Unsynced or delayed cloud orders cause
          this until Sync finishes.
        </p>
      ) : null}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <QuickLink href="/orders/new" title="New Order" desc="Create walk-in or phone order" />
        <QuickLink href="/orders/pending" title="Pending" desc="Resume or complete saved orders" />
        <QuickLink href="/expenses" title="Expenses" desc="Log salaries, rent, utilities, and stock costs" />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <p className="text-sm font-semibold text-zinc-400">{label}</p>
      <p
        className={`mt-2 text-3xl font-black ${warn ? "text-red-400" : "text-orange-400"}`}
      >
        {value}
      </p>
    </div>
  );
}

function QuickLink({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 transition hover:border-orange-500"
    >
      <p className="text-xl font-black text-white">{title}</p>
      <p className="mt-1 text-sm text-zinc-400">{desc}</p>
    </Link>
  );
}
