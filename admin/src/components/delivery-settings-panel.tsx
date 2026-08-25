"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  locationsApi,
  settingsApi,
  type DeliveryLocationRow,
} from "@/services/api";

/** Delivery areas + COD fee — embedded in Website Settings. */
export function DeliverySettingsPanel() {
  const [locations, setLocations] = useState<DeliveryLocationRow[]>([]);
  const [codFee, setCodFee] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingFee, setSavingFee] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryLocationRow | null>(null);
  const [form, setForm] = useState({ name: "", charge: 0 });

  const reload = async () => {
    const [locs, settings] = await Promise.all([
      locationsApi.list(),
      settingsApi.get(),
    ]);
    setLocations(locs);
    setCodFee(settings.cash_on_delivery_fee ?? 0);
  };

  useEffect(() => {
    reload()
      .catch((e) =>
        toast.error(
          e instanceof Error ? e.message : "Failed to load delivery settings",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", charge: 0 });
    setOpen(true);
  };

  const openEdit = (loc: DeliveryLocationRow) => {
    setEditing(loc);
    setForm({ name: loc.name, charge: loc.charge });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Location name is required");
      return;
    }
    try {
      if (editing) {
        await locationsApi.update(editing.id, {
          name: form.name.trim(),
          charge: form.charge,
        });
        toast.success("Location updated");
      } else {
        await locationsApi.create({
          name: form.name.trim(),
          charge: form.charge,
        });
        toast.success("Location added");
      }
      await reload();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const remove = async (loc: DeliveryLocationRow) => {
    if (!confirm(`Delete "${loc.name}"?`)) return;
    try {
      await locationsApi.remove(loc.id);
      toast.success("Location removed");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const saveFee = async () => {
    setSavingFee(true);
    try {
      await settingsApi.updateCodFee(codFee);
      toast.success("COD fee saved");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save COD fee");
    } finally {
      setSavingFee(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-zinc-400">Loading delivery settings…</p>
    );
  }

  return (
    <div id="delivery" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Delivery charges</h2>
          <p className="text-sm text-zinc-400">
            Areas and fees shown on the customer website checkout
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Location
        </Button>
      </div>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-bold">Cash on delivery fee</h3>
            <p className="text-sm text-zinc-400">
              Extra fee when customers choose COD
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-2">
              <Label>COD Fee (Rs)</Label>
              <Input
                type="number"
                className="w-40"
                value={codFee}
                onChange={(e) => setCodFee(Number(e.target.value))}
              />
            </div>
            <Button onClick={saveFee} disabled={savingFee}>
              {savingFee ? "Saving..." : "Save Fee"}
            </Button>
          </div>
        </div>
      </Card>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[700px] text-left">
          <thead className="bg-zinc-950 text-sm uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Charge</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => (
              <tr key={loc.id} className="border-t border-zinc-800">
                <td className="px-4 py-3 font-bold">{loc.name}</td>
                <td className="px-4 py-3 text-orange-400">
                  {loc.charge === 0 ? "Free" : formatPrice(loc.charge)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openEdit(loc)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => remove(loc)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!locations.length && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No delivery locations yet. Add one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Location" : "Add Location"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Location Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Delivery Charge</Label>
              <Input
                type="number"
                value={form.charge}
                onChange={(e) =>
                  setForm({ ...form, charge: Number(e.target.value) })
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
