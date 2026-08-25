"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type Customer } from "@/lib/types";
import { formatPrice } from "@/lib/utils";
import { ordersApi, type BackendOrder } from "@/services/api";

export default function CustomersPage() {
  const [orders, setOrders] = useState<BackendOrder[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);

  useEffect(() => {
    ordersApi
      .list()
      .then(setOrders)
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Failed to load customers"),
      );
  }, []);

  const customers = useMemo(() => {
    const grouped = new Map<string, Customer>();
    for (const order of orders) {
      const key = order.customer_id || order.phone;
      const current = grouped.get(key);
      grouped.set(key, {
        id: key,
        name: order.customer_name,
        phone: order.phone,
        ordersCount: (current?.ordersCount || 0) + 1,
        // Revenue should reflect money actually earned, so only completed
        // orders contribute to a customer's total spent.
        totalSpent:
          (current?.totalSpent || 0) +
          (order.order_status === "COMPLETED" ? order.grand_total : 0),
        lastOrderAt:
          !current || new Date(order.created_at) > new Date(current.lastOrderAt)
            ? order.created_at
            : current.lastOrderAt,
      });
    }
    return Array.from(grouped.values()).sort(
      (a, b) =>
        new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime(),
    );
  }, [orders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.phone.includes(q) ||
        c.name.toLowerCase().includes(q),
    );
  }, [customers, query]);

  const history = useMemo(() => {
    if (!selected) return [];
    return orders.filter(
      (o) =>
        (o.customer_id && o.customer_id === selected.id) ||
        o.phone === selected.phone,
    );
  }, [orders, selected]);

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Customer list, phone search, and order history"
      />

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <Input
          className="pl-10"
          placeholder="Search by phone or name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[800px] text-left">
          <thead className="bg-zinc-950 text-sm uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Orders</th>
              <th className="px-4 py-3">Total Spent</th>
              <th className="px-4 py-3">Last Order</th>
              <th className="px-4 py-3 text-right">History</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((customer) => (
              <tr key={customer.id} className="border-t border-zinc-800">
                <td className="px-4 py-3 font-bold">{customer.name}</td>
                <td className="px-4 py-3 text-zinc-300">{customer.phone}</td>
                <td className="px-4 py-3">{customer.ordersCount}</td>
                <td className="px-4 py-3 font-bold text-orange-400">
                  {formatPrice(customer.totalSpent)}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-400">
                  {new Date(customer.lastOrderAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelected(customer)}
                  >
                    View History
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selected?.name} — Order History
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {history.length === 0 ? (
              <p className="text-zinc-400">No orders found for this customer.</p>
            ) : (
              history.map((order) => (
                <Card key={order.id} className="!p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{order.order_number}</p>
                      <p className="text-sm text-zinc-400">
                        {(order.items || [])
                          .map(
                            (item) =>
                              `${item.quantity}× ${item.product?.name || "Item"}`,
                          )
                          .join(", ")}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {new Date(order.created_at).toLocaleString()}
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
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
