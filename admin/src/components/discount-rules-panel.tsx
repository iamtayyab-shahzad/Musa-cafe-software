"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import {
  discountRulesApi,
  type DiscountRuleRow,
} from "@/services/api";

const WEEKDAY_OPTS = [
  { v: 0, label: "Sun" },
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
] as const;

type FormState = {
  name: string;
  active: boolean;
  percent: number;
  min_subtotal: number;
  schedule_type: "always" | "date_range" | "weekdays";
  start_date: string;
  end_date: string;
  weekdays: number[];
  exclude_deals: boolean;
};

const emptyForm = (): FormState => ({
  name: "",
  active: true,
  percent: 10,
  min_subtotal: 1000,
  schedule_type: "weekdays",
  start_date: "",
  end_date: "",
  weekdays: [5, 0],
  exclude_deals: true,
});

function parseWeekdays(raw: string): number[] {
  try {
    const arr = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map(Number).filter((n) => n >= 0 && n <= 6);
  } catch {
    return [];
  }
}

/** Calendar day in Asia/Karachi — never slice UTC ISO (that shifts the day back). */
function ymd(iso: string | null | undefined): string {
  if (!iso) return "";
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return trimmed.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Send plain YYYY-MM-DD so the API stores the exact calendar day. */
function toIsoDate(day: string): string | null {
  if (!day) return null;
  return day.slice(0, 10);
}

function scheduleSummary(r: DiscountRuleRow): string {
  const days = parseWeekdays(r.weekdays_json)
    .map((d) => WEEKDAY_OPTS.find((o) => o.v === d)?.label)
    .filter(Boolean)
    .join(", ");
  if (r.schedule_type === "always") {
    return r.end_date
      ? `Always until ${ymd(r.end_date)}`
      : "Always (continuous)";
  }
  if (r.schedule_type === "date_range") {
    return `${ymd(r.start_date)} → ${ymd(r.end_date)}`;
  }
  return `${days || "—"}` + (r.end_date ? ` · until ${ymd(r.end_date)}` : "");
}

export function DiscountRulesPanel() {
  const [rows, setRows] = useState<DiscountRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountRuleRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const refresh = async () => {
    const list = await discountRulesApi.list();
    setRows(list || []);
  };

  useEffect(() => {
    let cancelled = false;
    refresh()
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : "Failed to load rules"),
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (r: DiscountRuleRow) => {
    setEditing(r);
    setForm({
      name: r.name,
      active: r.active,
      percent: r.percent,
      min_subtotal: r.min_subtotal,
      schedule_type: (r.schedule_type as FormState["schedule_type"]) || "always",
      start_date: ymd(r.start_date),
      end_date: ymd(r.end_date),
      weekdays: parseWeekdays(r.weekdays_json),
      exclude_deals: r.exclude_deals !== false,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (form.percent < 1 || form.percent > 100) {
      toast.error("Percent must be 1–100");
      return;
    }
    if (form.schedule_type === "date_range" && (!form.start_date || !form.end_date)) {
      toast.error("Date range needs start and end");
      return;
    }
    if (form.schedule_type === "weekdays" && form.weekdays.length === 0) {
      toast.error("Pick at least one weekday");
      return;
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      active: form.active,
      percent: form.percent,
      min_subtotal: form.min_subtotal,
      schedule_type: form.schedule_type,
      start_date: toIsoDate(form.start_date),
      end_date: toIsoDate(form.end_date),
      weekdays: form.weekdays,
      exclude_deals: form.exclude_deals,
    };

    try {
      if (editing) {
        await discountRulesApi.update(editing.id, payload);
        toast.success("Discount rule updated");
      } else {
        await discountRulesApi.create(payload);
        toast.success("Discount rule created");
      }
      await refresh();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const toggle = async (id: string, active: boolean) => {
    try {
      if (active) await discountRulesApi.enable(id);
      else await discountRulesApi.disable(id);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this discount rule?")) return;
    try {
      await discountRulesApi.remove(id);
      toast.success("Deleted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-zinc-400">
        Loading discount rules...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-zinc-400">
          These rules change real cart/POS totals (% off above a minimum).
          By default combo/flyer deals are excluded — use the switch on each
          rule if you want deals included. Website and POS pick rules up from
          the server after sync.
        </p>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New discount rule
        </Button>
      </div>

      <div className="space-y-3">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-400">
            No discount rules yet. Create one (e.g. Fri &amp; Sun 10% off).
          </p>
        ) : null}
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-lg font-black text-white">{r.name}</p>
              <p className="mt-1 text-sm text-zinc-400">
                {r.percent}% off · min Rs {r.min_subtotal} · {scheduleSummary(r)}
                {r.exclude_deals !== false
                  ? " · combo deals excluded"
                  : " · combo deals included"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={r.active ? "success" : "danger"}>
                  {r.active ? "Active" : "Off"}
                </Badge>
                <Badge tone="orange">{r.schedule_type}</Badge>
                <Badge tone={r.exclude_deals !== false ? "warning" : "success"}>
                  {r.exclude_deals !== false
                    ? "Deals excluded"
                    : "Deals included"}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Switch
                checked={r.active}
                onCheckedChange={(v) => toggle(r.id, v)}
              />
              <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button size="sm" variant="danger" onClick={() => remove(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit discount rule" : "Create discount rule"}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Fri & Sun 10% off"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Percent off</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.percent}
                  onChange={(e) =>
                    setForm({ ...form, percent: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Min order (Rs, eligible items)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.min_subtotal}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      min_subtotal: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Schedule</Label>
              <select
                className="flex h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-white"
                value={form.schedule_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    schedule_type: e.target.value as FormState["schedule_type"],
                  })
                }
              >
                <option value="always">Always / until end date</option>
                <option value="date_range">Date range (or single day)</option>
                <option value="weekdays">Specific weekdays</option>
              </select>
            </div>
            {(form.schedule_type === "date_range" ||
              form.schedule_type === "always" ||
              form.schedule_type === "weekdays") && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>
                    {form.schedule_type === "date_range"
                      ? "Start date"
                      : "Start (optional)"}
                  </Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) =>
                      setForm({ ...form, start_date: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    {form.schedule_type === "date_range"
                      ? "End date"
                      : "Until date (optional)"}
                  </Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) =>
                      setForm({ ...form, end_date: e.target.value })
                    }
                  />
                </div>
              </div>
            )}
            {form.schedule_type === "weekdays" ? (
              <div className="space-y-2">
                <Label>Weekdays (Pakistan time)</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_OPTS.map((d) => {
                    const on = form.weekdays.includes(d.v);
                    return (
                      <button
                        key={d.v}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            weekdays: on
                              ? form.weekdays.filter((x) => x !== d.v)
                              : [...form.weekdays, d.v],
                          })
                        }
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          on
                            ? "border-orange-500 bg-orange-500/20 text-orange-200"
                            : "border-zinc-700 text-zinc-400"
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-3">
              <Label>Active</Label>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-3">
              <div>
                <Label>Include combo / flyer deals</Label>
                <p className="mt-1 text-xs text-zinc-400">
                  Off (recommended): % discount never applies to products in the
                  Deals category — including any new deals you add later. On:
                  deals also get this discount.
                </p>
              </div>
              <Switch
                checked={!form.exclude_deals}
                onCheckedChange={(include) =>
                  setForm({ ...form, exclude_deals: !include })
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void save()}>Save rule</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
