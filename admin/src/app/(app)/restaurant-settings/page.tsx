"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  parseDrinkFlavors,
  serializeDrinkFlavors,
} from "@/lib/drink-flavors";
import {
  assertImageFieldSafe,
  prepareProductImage,
} from "@/lib/image-upload";
import { emptyRestaurantSettings, type RestaurantSettings } from "@/lib/types";
import { settingsApi, type BackendSetting } from "@/services/api";
import { Switch } from "@/components/ui/switch";

function mapSettings(s: BackendSetting): RestaurantSettings {
  return {
    restaurantName: s.restaurant_name || "",
    logo: s.logo || "",
    phone: s.phone || "",
    whatsapp: s.whatsapp || "",
    openingHours: s.opening_time || "",
    closingHours: s.closing_time || "",
    currency: s.currency || "Rs",
    cashOnDeliveryFee: s.cash_on_delivery_fee ?? 0,
    drinkFlavors: parseDrinkFlavors(s.drink_flavors),
    posOneClickComplete: Boolean(s.pos_one_click_complete),
    posAllowHistoryEdit: Boolean(s.pos_allow_history_edit),
  };
}

export default function RestaurantSettingsPage() {
  const [form, setForm] = useState<RestaurantSettings>(emptyRestaurantSettings);
  const [newFlavor, setNewFlavor] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toggling, setToggling] = useState<
    null | "posOneClickComplete" | "posAllowHistoryEdit"
  >(null);

  useEffect(() => {
    let cancelled = false;
    settingsApi
      .get()
      .then((s) => {
        if (cancelled) return;
        setForm(mapSettings(s));
        setDirty(false);
      })
      .catch((e) =>
        toast.error(
          e instanceof Error ? e.message : "Failed to load restaurant settings",
        ),
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addFlavor = () => {
    const name = newFlavor.trim();
    if (!name) return;
    if (form.drinkFlavors.some((f) => f.toLowerCase() === name.toLowerCase())) {
      toast.error("Flavor already in the list");
      return;
    }
    setForm({ ...form, drinkFlavors: [...form.drinkFlavors, name] });
    setNewFlavor("");
    setDirty(true);
  };

  const save = async () => {
    try {
      assertImageFieldSafe(form.logo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Logo image too large");
      return;
    }
    setSaving(true);
    try {
      const saved = await settingsApi.update({
        restaurant_name: form.restaurantName,
        phone: form.phone,
        whatsapp: form.whatsapp,
        logo: form.logo,
        opening_time: form.openingHours,
        closing_time: form.closingHours,
        currency: form.currency,
        cash_on_delivery_fee: Number(form.cashOnDeliveryFee || 0),
        drink_flavors: serializeDrinkFlavors(form.drinkFlavors),
        pos_one_click_complete: form.posOneClickComplete,
        pos_allow_history_edit: form.posAllowHistoryEdit,
      });
      setForm(mapSettings(saved));
      setDirty(false);
      toast.success("Restaurant settings saved");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to save restaurant settings",
      );
    } finally {
      setSaving(false);
    }
  };

  /** POS toggles save immediately so refresh does not wipe them. */
  const savePosToggle = async (
    field: "posOneClickComplete" | "posAllowHistoryEdit",
    value: boolean,
  ) => {
    const previous = form[field];
    const nextForm = { ...form, [field]: value };
    setForm(nextForm);
    setToggling(field);
    try {
      const saved = await settingsApi.update({
        pos_one_click_complete:
          field === "posOneClickComplete"
            ? value
            : nextForm.posOneClickComplete,
        pos_allow_history_edit:
          field === "posAllowHistoryEdit"
            ? value
            : nextForm.posAllowHistoryEdit,
      });
      setForm((current) => ({
        ...current,
        posOneClickComplete: Boolean(saved.pos_one_click_complete),
        posAllowHistoryEdit: Boolean(saved.pos_allow_history_edit),
      }));
      toast.success(
        field === "posOneClickComplete"
          ? value
            ? "One-click print enabled"
            : "One-click print disabled"
          : value
            ? "Order history edit enabled"
            : "Order history edit disabled",
      );
    } catch (e) {
      setForm((current) => ({ ...current, [field]: previous }));
      toast.error(
        e instanceof Error ? e.message : "Failed to save POS setting",
      );
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-zinc-400">
        Loading restaurant settings...
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Restaurant Settings"
        description="Core restaurant identity, hours, currency, COD fee, POS print mode, and drink flavors"
        action={
          <div className="flex items-center gap-3">
            {dirty ? (
              <span className="text-xs font-medium text-amber-400">
                Unsaved changes
              </span>
            ) : null}
            <Button onClick={save} disabled={saving || !dirty}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        }
      />

      <Card className="mx-auto max-w-3xl space-y-4">
        <div className="space-y-2">
          <Label>Restaurant Name</Label>
          <Input
            value={form.restaurantName}
            onChange={(e) => {
              setForm({ ...form, restaurantName: e.target.value });
              setDirty(true);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>Logo URL</Label>
          <Input
            value={form.logo}
            onChange={(e) => {
              setForm({ ...form, logo: e.target.value });
              setDirty(true);
            }}
            placeholder="https://... or upload below"
          />
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void (async () => {
                try {
                  toast.message("Uploading logo…");
                  const prepared = await prepareProductImage(file);
                  setForm((f) => ({ ...f, logo: prepared.url }));
                  setDirty(true);
                  toast.success(
                    `Logo ready (~${Math.round(prepared.bytesApprox / 1024)}KB)`,
                  );
                } catch (err) {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : "Logo upload failed",
                  );
                }
              })();
            }}
          />
          <p className="text-xs text-zinc-500">
            Compressed locally, then uploaded to Cloudinary. Only the URL is
            saved.
          </p>
          {form.logo.startsWith("https://") ? (
            <p className="text-xs text-emerald-600">Cloudinary logo ready</p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => {
                setForm({ ...form, phone: e.target.value });
                setDirty(true);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp</Label>
            <Input
              value={form.whatsapp}
              onChange={(e) => {
                setForm({ ...form, whatsapp: e.target.value });
                setDirty(true);
              }}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Opening Hours</Label>
            <Input
              value={form.openingHours}
              onChange={(e) => {
                setForm({ ...form, openingHours: e.target.value });
                setDirty(true);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Closing Hours</Label>
            <Input
              value={form.closingHours}
              onChange={(e) => {
                setForm({ ...form, closingHours: e.target.value });
                setDirty(true);
              }}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Currency</Label>
            <Input
              value={form.currency}
              onChange={(e) => {
                setForm({ ...form, currency: e.target.value });
                setDirty(true);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Cash On Delivery Fee</Label>
            <Input
              type="number"
              value={form.cashOnDeliveryFee}
              onChange={(e) => {
                setForm({
                  ...form,
                  cashOnDeliveryFee: Number(e.target.value),
                });
                setDirty(true);
              }}
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Label>POS one-click complete</Label>
              <p className="mt-1 text-sm text-zinc-500">
                When enabled, cashier Save Pending / Enter prints the kitchen
                ticket and the customer receipt together, and marks the order
                completed. When off, the normal pending → complete flow is
                unchanged. Saves immediately.
              </p>
            </div>
            <Switch
              checked={form.posOneClickComplete}
              disabled={toggling !== null}
              onCheckedChange={(on) =>
                void savePosToggle("posOneClickComplete", on)
              }
              aria-label="POS one-click complete"
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Label>Allow edit from Order History</Label>
              <p className="mt-1 text-sm text-zinc-500">
                When enabled, POS Order History shows an Edit button so staff can
                reopen a past ticket (by daily number). Keep off unless you want
                cashiers to change completed sales. Saves immediately.
              </p>
            </div>
            <Switch
              checked={form.posAllowHistoryEdit}
              disabled={toggling !== null}
              onCheckedChange={(on) =>
                void savePosToggle("posAllowHistoryEdit", on)
              }
              aria-label="Allow edit from Order History"
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-4">
          <div>
            <Label>Cold Drink Flavors</Label>
            <p className="mt-1 text-sm text-zinc-500">
              Shown when ordering 500 ml / 1 L / 1.5 L / 2.25 L drinks. Remove a
              brand if it is not in stock.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.drinkFlavors.map((flavor) => (
              <span
                key={flavor}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-bold"
              >
                {flavor}
                <button
                  type="button"
                  className="text-red-400 hover:text-red-300"
                  onClick={() => {
                    setForm({
                      ...form,
                      drinkFlavors: form.drinkFlavors.filter((f) => f !== flavor),
                    });
                    setDirty(true);
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            {!form.drinkFlavors.length ? (
              <span className="text-sm text-zinc-500">No flavors yet</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-xs"
              placeholder="e.g. Pepsi"
              value={newFlavor}
              onChange={(e) => setNewFlavor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFlavor();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={addFlavor}>
              Add Flavor
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
