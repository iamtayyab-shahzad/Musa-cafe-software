"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/utils";
import {
  ordersApi,
  type BackendOrder,
} from "@/services/api";

const PAGE_SIZE = 50;

/** Local calendar YYYY-MM-DD in Asia/Karachi (matches API date windows). */
function karachiYmd(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

type DatePreset = "all" | "today" | "week" | "month" | "custom";

function rangeForPreset(preset: DatePreset): { start?: string; end?: string } {
  const today = karachiYmd();
  if (preset === "today") return { start: today, end: today };
  if (preset === "week") {
    // Monday-start week in Karachi (same as reports).
    const [y, m, d] = today.split("-").map(Number);
    const asUtc = new Date(Date.UTC(y, m - 1, d));
    const weekday = asUtc.getUTCDay(); // Sun=0
    const offset = (weekday + 6) % 7;
    const start = addDaysYmd(today, -offset);
    return { start, end: today };
  }
  if (preset === "month") {
    return { start: `${today.slice(0, 8)}01`, end: today };
  }
  return {};
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<BackendOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(0);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editing, setEditing] = useState<BackendOrder | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(query);
      setPage(0);
    }, 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const refresh = useCallback(async () => {
    const presetRange =
      datePreset === "custom"
        ? {
            start: startDate || undefined,
            end: endDate || undefined,
          }
        : rangeForPreset(datePreset);

    const pageData = await ordersApi.listPage({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      status,
      q: debouncedQuery,
      start: presetRange.start,
      end: presetRange.end,
    });
    setOrders(pageData.items || []);
    setTotal(pageData.total || 0);
  }, [page, status, debouncedQuery, datePreset, startDate, endDate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh()
      .catch((error) => {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Failed to load orders",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const setStatusAndReset = (value: string) => {
    setStatusFilter(value);
    setPage(0);
  };

  const applyPreset = (preset: DatePreset) => {
    setDatePreset(preset);
    setPage(0);
    if (preset === "custom") {
      if (!startDate && !endDate) {
        const today = karachiYmd();
        setStartDate(`${today.slice(0, 8)}01`);
        setEndDate(today);
      }
      return;
    }
    const r = rangeForPreset(preset);
    setStartDate(r.start || "");
    setEndDate(r.end || "");
  };

  const openEdit = (order: BackendOrder) => {
    if (order.order_status !== "PENDING") {
      toast.error("Only pending orders can be edited");
      return;
    }
    setEditing(order);
    setEditName(order.customer_name);
    setEditPhone(order.phone);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const name = editName.trim();
    if (!name) {
      toast.error("Customer name is required");
      return;
    }
    try {
      await ordersApi.update(editing.id, {
        customer_name: name,
        phone: editPhone.trim(),
      });
      await refresh();
      toast.success("Pending order updated");
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  };

  const changeStatus = async (
    id: string,
    next: "COMPLETED" | "CANCELLED",
  ) => {
    try {
      if (next === "COMPLETED") await ordersApi.complete(id);
      else await ordersApi.cancel(id);
      await refresh();
      toast.success(`Order marked ${next.toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fromRow = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const toRow = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Search, filter by date, edit pending, complete, or cancel"
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full max-w-md flex-1 sm:min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              className="pl-10"
              placeholder="Search by order #, name, or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {["ALL", "PENDING", "COMPLETED", "CANCELLED"].map((value) => (
            <Button
              key={value}
              size="sm"
              variant={status === value ? "default" : "secondary"}
              onClick={() => setStatusAndReset(value)}
              className="shrink-0"
            >
              {value}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All time"],
                ["today", "Today"],
                ["week", "This week"],
                ["month", "This month"],
                ["custom", "Custom"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={datePreset === id ? "default" : "secondary"}
                onClick={() => applyPreset(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          {datePreset === "custom" ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-zinc-500">From</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(0);
                  }}
                  className="w-auto"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-500">To</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(0);
                  }}
                  className="w-auto"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[1050px] text-left">
          <thead className="bg-zinc-950 text-sm uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-zinc-800">
                <td className="px-4 py-3">
                  <p className="font-bold">{order.order_number}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold">{order.customer_name}</p>
                  <p className="text-sm text-zinc-400">{order.phone}</p>
                </td>
                <td className="px-4 py-3 text-sm text-zinc-300">
                  {(order.items || [])
                    .map((item) => {
                      const name = item.product?.name || item.product_id;
                      const size = item.product_size?.size;
                      return `${item.quantity}× ${name}${size ? ` (${size})` : ""}`;
                    })
                    .join(", ") || "—"}
                </td>
                <td className="px-4 py-3 capitalize text-zinc-300">
                  {order.payment_method}
                </td>
                <td className="px-4 py-3 font-bold text-orange-400">
                  <p>{formatPrice(order.grand_total)}</p>
                  <p className="text-xs font-normal text-zinc-500">
                    Subtotal {formatPrice(order.subtotal)} · Delivery{" "}
                    {formatPrice(order.delivery_charge)}
                    {order.cash_on_delivery_fee > 0
                      ? ` · COD ${formatPrice(order.cash_on_delivery_fee)}`
                      : ""}
                  </p>
                </td>
                <td className="px-4 py-3">
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
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {order.order_status === "PENDING" ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openEdit(order)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => changeStatus(order.id, "COMPLETED")}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Complete
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => changeStatus(order.id, "CANCELLED")}
                        >
                          <XCircle className="h-4 w-4" />
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <span className="text-sm text-zinc-600">—</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !orders.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                  No orders found.
                </td>
              </tr>
            ) : null}
            {loading && !orders.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          {total === 0
            ? "No results"
            : `Showing ${fromRow}–${toRow} of ${total}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={loading || page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="min-w-[5rem] text-center text-sm text-zinc-300">
            Page {Math.min(page + 1, totalPages)} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={loading || page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Pending Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={saveEdit}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
