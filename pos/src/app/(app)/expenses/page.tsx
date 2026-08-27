"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPrice } from "@/lib/utils";
import { expensesApi, type PosExpense } from "@/services/api";

const PAYMENT_METHODS = ["cash", "card", "bank", "jazzcash", "easypaisa"];
const RECURRENCE = ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"];

type ExpenseForm = {
  category: string;
  title: string;
  amount: number;
  expenseDate: string;
  paymentMethod: string;
  notes: string;
  recurrence: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(categories: string[]): ExpenseForm {
  return {
    category: categories[0] || "Rent",
    title: "",
    amount: 0,
    expenseDate: todayISO(),
    paymentMethod: "cash",
    notes: "",
    recurrence: "NONE",
  };
}

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function daysBetween(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

/** Same allocation rules as admin Expenses / Profit & Loss. */
function allocateExpense(
  amount: number,
  recurrence: string,
  expenseDate: Date,
  start: Date,
  end: Date,
): number {
  if (amount <= 0 || !(end > start)) return 0;
  const exp = new Date(
    expenseDate.getFullYear(),
    expenseDate.getMonth(),
    expenseDate.getDate(),
  );
  const periodStart = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const periodEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const rec = (recurrence || "NONE").toUpperCase();

  if (rec === "NONE") {
    return exp >= periodStart && exp < periodEnd ? amount : 0;
  }

  let from = periodStart;
  if (exp > from) from = exp;
  if (!(from < periodEnd)) return 0;

  if (rec === "DAILY") {
    return amount * daysBetween(from, periodEnd);
  }
  if (rec === "WEEKLY") {
    return Math.round((amount * daysBetween(from, periodEnd)) / 7);
  }
  if (rec === "YEARLY") {
    return Math.round((amount * daysBetween(from, periodEnd)) / 365);
  }
  if (rec === "MONTHLY") {
    let total = 0;
    let cur = from;
    while (cur < periodEnd) {
      const monthStart = new Date(cur.getFullYear(), cur.getMonth(), 1);
      const nextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const segEnd = nextMonth < periodEnd ? nextMonth : periodEnd;
      const segDays = daysBetween(cur, segEnd);
      const dim = daysBetween(monthStart, nextMonth);
      if (dim > 0 && segDays > 0) {
        total += (amount * segDays) / dim;
      }
      cur = segEnd;
    }
    return Math.round(total);
  }
  return exp >= periodStart && exp < periodEnd ? amount : 0;
}

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PosExpense | null>(null);
  const [form, setForm] = useState(() => emptyForm([]));

  const { data, isLoading: loading, isError, error, refetch } = useQuery({
    queryKey: ["expenses"],
    staleTime: 60_000,
    queryFn: async () => {
      const [rows, cats] = await Promise.all([
        expensesApi.list(),
        expensesApi.categories(),
      ]);
      return {
        expenses: rows
          .slice()
          .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate)),
        categories: cats.length ? cats : ["Rent"],
      };
    },
  });

  const expenses = data?.expenses ?? [];
  const categories = data?.categories ?? ["Rent"];

  useEffect(() => {
    if (isError) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load expenses",
      );
    }
  }, [isError, error]);

  const refresh = async () => {
    await refetch();
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const weekStart = startOfWeek(now);
    const weekEnd = addDays(weekStart, 7);
    let month = 0;
    let week = 0;
    for (const e of expenses) {
      const d = new Date(e.expenseDate);
      month += allocateExpense(e.amount, e.recurrence, d, monthStart, monthEnd);
      week += allocateExpense(e.amount, e.recurrence, d, weekStart, weekEnd);
    }
    return { month, week };
  }, [expenses]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(categories));
    setOpen(true);
  };

  const openEdit = (e: PosExpense) => {
    setEditing(e);
    setForm({
      category: e.category,
      title: e.title,
      amount: e.amount,
      expenseDate: e.expenseDate,
      paymentMethod: e.paymentMethod || "cash",
      notes: e.notes,
      recurrence: e.recurrence || "NONE",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.category.trim()) {
      toast.error("Category is required");
      return;
    }
    if (Number(form.amount) <= 0) {
      toast.error("Amount must be greater than zero");
      return;
    }
    try {
      const payload = {
        category: form.category.trim(),
        title: form.title.trim(),
        amount: Number(form.amount || 0),
        expenseDate: form.expenseDate,
        paymentMethod: form.paymentMethod,
        notes: form.notes,
        recurrence: form.recurrence,
      };
      if (editing) {
        await expensesApi.update(editing.id, payload);
        toast.success("Expense updated");
      } else {
        await expensesApi.create(payload);
        toast.success("Expense created");
      }
      setOpen(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    try {
      await expensesApi.remove(id);
      toast.success("Expense deleted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Expenses</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Log salaries, rent, utilities, and stock buys. Use MONTHLY for
            salaries — Profit &amp; Loss (admin) splits them by days in the
            month.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Expense
        </Button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-400">
            <Wallet className="h-4 w-4" />
            This Month
          </p>
          <p className="mt-2 text-3xl font-black text-orange-400">
            {formatPrice(stats.month)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Allocated share for this calendar month
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-400">
            <CalendarDays className="h-4 w-4" />
            This Week
          </p>
          <p className="mt-2 text-3xl font-black text-orange-400">
            {formatPrice(stats.week)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Allocated share for Mon–Sun week
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center text-zinc-400">
          Loading expenses...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-zinc-950 text-sm uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Recurrence</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3 text-zinc-400">{e.expenseDate}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-orange-500/15 px-2 py-1 text-xs font-bold text-orange-300">
                      {e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {e.title || "—"}
                    {e.notes ? (
                      <span className="mt-1 block text-xs font-normal text-zinc-500">
                        {e.notes}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-orange-400">
                    {formatPrice(e.amount)}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{e.paymentMethod}</td>
                  <td className="px-4 py-3 text-zinc-300">{e.recurrence}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openEdit(e)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => remove(e.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!expenses.length ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-zinc-500"
                  >
                    No expenses logged yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Expense" : "Add Expense"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="Optional label"
              />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                min={0}
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.expenseDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expenseDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, paymentMethod: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Recurrence</Label>
              <Select
                value={form.recurrence}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, recurrence: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">
                Salaries/rent: MONTHLY once. Stock buys: NONE on the purchase
                day.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing ? "Save" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
