"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPrice } from "@/lib/utils";
import {
  parseDrinkFlavors,
  serializeDrinkFlavors,
} from "@/lib/drink-flavors";
import { assertImageFieldSafe } from "@/lib/image-upload";
import { usePosTheme } from "@/context/theme-context";
import { locationsApi, offersApi, settingsApi } from "@/services/api";
import type { Location, Offer } from "@/types";
import {
  discardAction,
  healIndexedDb,
  listDeadActions,
  listLocalOrders,
  listPendingActions,
  reviveDeadAction,
} from "@/lib/offline-db";
import {
  resolveFailedSyncOrder,
  type FailedSyncOrderSummary,
} from "@/lib/failed-sync-order";
import {
  clearObsoleteOrderQueue,
  clearSyncConflicts,
  getSyncState,
  runSync,
  subscribeSync,
} from "@/lib/sync-engine";
import type { OfflineAction } from "@/types";

function SyncHealthPanel() {
  const [busy, setBusy] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<
    { type: string; count: number }[]
  >([]);
  const [sync, setSync] = useState(getSyncState());

  useEffect(() => subscribeSync(setSync), []);

  const refreshPreview = async () => {
    const pending = await listPendingActions();
    const counts = new Map<string, number>();
    for (const a of pending) {
      counts.set(a.type, (counts.get(a.type) || 0) + 1);
    }
    setPendingPreview(
      [...counts.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
    );
  };

  useEffect(() => {
    void refreshPreview();
  }, [sync.pending_count, sync.syncing]);

  return (
    <section className="mb-8 rounded-xl border border-orange-500/40 bg-zinc-950 p-5">
      <h2 className="text-xl font-bold text-orange-300">Sync health (this PC)</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Queue and conflicts are stored only on this browser. Orders already in
        the cloud (visible on another PC) can leave stale CREATE/UPDATE jobs
        here — clear those safely below, then sync.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded bg-orange-500/20 px-2 py-1 text-orange-200">
          {sync.pending_count} pending
        </span>
        <span className="rounded bg-amber-500/20 px-2 py-1 text-amber-200">
          {sync.conflicts.length} conflicts
        </span>
        <span className="rounded bg-zinc-800 px-2 py-1 text-zinc-300">
          {sync.dead_count} failed
        </span>
      </div>
      {pendingPreview.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-zinc-400">
          {pendingPreview.map((row) => (
            <li key={row.type}>
              {row.type}: <span className="text-zinc-200">{row.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-emerald-400">Queue is empty.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const n = await clearObsoleteOrderQueue();
              await clearSyncConflicts();
              toast.success(
                n > 0
                  ? `Cleared ${n} obsolete sync item(s) + conflict log`
                  : "No obsolete items; conflict log cleared",
              );
              await refreshPreview();
              void runSync("manual");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Clear failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Clear obsolete order sync (safe)
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || sync.syncing}
          onClick={() => {
            void runSync("manual");
            toast.message("Sync started");
          }}
        >
          Sync now
        </Button>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Safe clear removes duplicate/stale CREATE and UPDATE jobs when the order
        is already on the server or already completed. It does not delete sales
        from the database.
      </p>
    </section>
  );
}

function FailedSyncPanel() {
  const [items, setItems] = useState<
    { action: OfflineAction; order: FailedSyncOrderSummary | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const [dead, locals] = await Promise.all([
        listDeadActions(),
        listLocalOrders(),
      ]);
      setItems(
        dead.map((action) => ({
          action,
          order: resolveFailedSyncOrder(action, locals),
        })),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <section className="mb-8 rounded-xl border border-amber-500/40 bg-zinc-950 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-amber-300">Failed sync items</h2>
          <p className="mt-1 text-sm text-zinc-400">
            These actions stopped retrying. Retry all or discard after fixing the
            cause (bad product id, expired login, etc.).
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || items.length === 0}
          onClick={async () => {
            await healIndexedDb();
            for (const item of items) await reviveDeadAction(item.action.id);
            toast.success("Retrying failed sync…");
            await refresh();
            void runSync("manual");
          }}
        >
          Retry all
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <div className="space-y-2">
          {items.map(({ action, order }) => (
            <div
              key={action.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-black/40 px-3 py-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold text-zinc-200">
                  {action.type}
                  {order?.order_number ? (
                    <span className="ml-2 font-normal text-zinc-400">
                      · {order.order_number}
                    </span>
                  ) : null}
                </p>
                {order ? (
                  <div className="text-xs text-zinc-300">
                    <p>
                      <span className="text-zinc-500">Customer:</span>{" "}
                      {order.customer_name}
                    </p>
                    <p className="mt-0.5 break-words">
                      <span className="text-zinc-500">Items:</span>{" "}
                      {order.items_label}
                    </p>
                    <p className="mt-0.5">
                      <span className="text-zinc-500">Total:</span>{" "}
                      {formatPrice(order.grand_total)}
                      {order.created_at ? (
                        <>
                          {" "}
                          <span className="text-zinc-500">·</span>{" "}
                          {new Date(order.created_at).toLocaleString()}
                        </>
                      ) : null}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    No linked local order details found for this action.
                  </p>
                )}
                <p className="break-all text-xs text-amber-200/80">
                  {action.error || "Unknown error"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await reviveDeadAction(action.id);
                    toast.success("Queued for retry");
                    await refresh();
                    void runSync("manual");
                  }}
                >
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    await discardAction(action.id);
                    toast.message("Discarded");
                    await refresh();
                  }}
                >
                  Discard
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StorageHealthPanel() {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  return (
    <section className="mb-8 rounded-xl border border-zinc-700 bg-zinc-950 p-5">
      <h2 className="text-xl font-bold text-zinc-100">Storage Health</h2>
      <p className="mt-1 text-sm text-zinc-400">
        This till stores orders in the browser. A corrupted cache row can freeze
        sync and show Rs 0 sales. Clean now deletes only empty/broken rows — it
        does not delete real orders.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const report = await healIndexedDb();
              const n = report.removed.length;
              setLast(
                n
                  ? `Removed ${n} broken row${n === 1 ? "" : "s"}`
                  : "Storage looks healthy",
              );
              toast.success(
                n
                  ? `Cleaned ${n} broken storage row${n === 1 ? "" : "s"}`
                  : "No broken rows found",
              );
              void runSync("manual");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Clean failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Clean now
        </Button>
        {last ? <span className="text-xs text-zinc-500">{last}</span> : null}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { theme, setTheme } = usePosTheme();
  const [form, setForm] = useState({
    restaurant_name: "",
    phone: "",
    whatsapp: "",
    logo: "",
    opening_time: "",
    closing_time: "",
    cash_on_delivery_fee: 0,
    currency: "Rs",
    google_maps: "",
    facebook: "",
    instagram: "",
  });
  const [drinkFlavors, setDrinkFlavors] = useState<string[]>([]);
  const [newFlavor, setNewFlavor] = useState("");
  const [locOpen, setLocOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [locForm, setLocForm] = useState({ name: "", delivery_charge: 0 });
  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  const [offerForm, setOfferForm] = useState({
    title: "",
    description: "",
    image: "",
    active: true,
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: locationsApi.list,
  });
  const { data: offers = [] } = useQuery({
    queryKey: ["offers"],
    queryFn: offersApi.list,
  });

  useEffect(() => {
    if (!settings) return;
    setForm({
      restaurant_name: settings.restaurant_name || "",
      phone: settings.phone || "",
      whatsapp: settings.whatsapp || "",
      logo: settings.logo || "",
      opening_time: settings.opening_time || "",
      closing_time: settings.closing_time || "",
      cash_on_delivery_fee: settings.cash_on_delivery_fee || 0,
      currency: settings.currency || "Rs",
      google_maps: settings.google_maps || "",
      facebook: settings.facebook || "",
      instagram: settings.instagram || "",
    });
    setDrinkFlavors(parseDrinkFlavors(settings.drink_flavors));
  }, [settings]);

  const addDrinkFlavor = () => {
    const name = newFlavor.trim();
    if (!name) return;
    if (drinkFlavors.some((f) => f.toLowerCase() === name.toLowerCase())) {
      toast.error("Flavor already in the list");
      return;
    }
    setDrinkFlavors((prev) => [...prev, name]);
    setNewFlavor("");
  };

  const saveSettings = async () => {
    try {
      assertImageFieldSafe(String(form.logo || ""));
      const res = await settingsApi.update({
        ...form,
        cash_on_delivery_fee: Number(form.cash_on_delivery_fee),
        drink_flavors: serializeDrinkFlavors(drinkFlavors),
      });
      toast.success(
        res.offline ? res.message || "Settings saved offline" : "Settings saved",
      );
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const saveLocation = async () => {
    try {
      if (editingLoc) {
        await locationsApi.update(editingLoc.id, locForm);
      } else {
        await locationsApi.create(locForm);
      }
      toast.success("Location saved");
      setLocOpen(false);
      qc.invalidateQueries({ queryKey: ["locations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const saveOffer = async () => {
    try {
      assertImageFieldSafe(offerForm.image || "");
      await offersApi.create(offerForm);
      toast.success("Offer created");
      setOfferOpen(false);
      qc.invalidateQueries({ queryKey: ["offers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <h1 className="mb-6 text-3xl font-black">Settings</h1>

      <SyncHealthPanel />
      <FailedSyncPanel />
      <StorageHealthPanel />

      <section className="mb-8 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="mb-2 text-xl font-bold">Display</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Use a white background if the shop screen is hard to read in dark
          mode. Orange buttons and layout stay the same.
        </p>
        <div className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-3">
          <div>
            <Label>Light background</Label>
            <p className="text-xs text-zinc-500">
              Saved on this computer only
            </p>
          </div>
          <Switch
            checked={theme === "light"}
            onCheckedChange={(on) => setTheme(on ? "light" : "dark")}
          />
        </div>
      </section>

      <section className="mb-8 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="mb-4 text-xl font-bold">Restaurant</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              ["restaurant_name", "Restaurant Name"],
              ["phone", "Phone"],
              ["whatsapp", "WhatsApp"],
              ["logo", "Logo URL"],
              ["opening_time", "Opening Time"],
              ["closing_time", "Closing Time"],
              ["cash_on_delivery_fee", "Cash On Delivery Fee"],
              ["currency", "Currency"],
              ["google_maps", "Google Maps"],
              ["facebook", "Facebook"],
              ["instagram", "Instagram"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label>{label}</Label>
              <Input
                type={key === "cash_on_delivery_fee" ? "number" : "text"}
                value={form[key]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    [key]:
                      key === "cash_on_delivery_fee"
                        ? Number(e.target.value)
                        : e.target.value,
                  })
                }
              />
            </div>
          ))}
        </div>
        <Button className="mt-4" size="lg" onClick={saveSettings}>
          Save Settings
        </Button>
      </section>

      <section className="mb-8 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="mb-2 text-xl font-bold">Cold Drink Flavors</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Brands available for 500 ml / 1 L / 1.5 L / 2.25 L drinks. Remove a
          flavor if it is out of stock; add it back when it returns.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {drinkFlavors.map((flavor) => (
            <span
              key={flavor}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-black/40 px-3 py-2 text-sm font-bold"
            >
              {flavor}
              <button
                type="button"
                className="text-red-400 hover:text-red-300"
                onClick={() =>
                  setDrinkFlavors((prev) => prev.filter((f) => f !== flavor))
                }
              >
                ×
              </button>
            </span>
          ))}
          {!drinkFlavors.length ? (
            <span className="text-sm text-zinc-500">No flavors — add one below</span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            placeholder="e.g. Coke, Sprite, Fanta, Pepsi"
            value={newFlavor}
            onChange={(e) => setNewFlavor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDrinkFlavor();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={addDrinkFlavor}>
            Add Flavor
          </Button>
        </div>
        <Button className="mt-4" size="lg" onClick={saveSettings}>
          Save Flavors
        </Button>
      </section>

      <section className="mb-8 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Delivery Locations</h2>
          <Button
            onClick={() => {
              setEditingLoc(null);
              setLocForm({ name: "", delivery_charge: 0 });
              setLocOpen(true);
            }}
          >
            Add Location
          </Button>
        </div>
        <div className="space-y-2">
          {locations.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between rounded-lg bg-black/40 px-3 py-3"
            >
              <p>
                {l.name} · {formatPrice(l.delivery_charge, form.currency)}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditingLoc(l);
                    setLocForm({
                      name: l.name,
                      delivery_charge: l.delivery_charge,
                    });
                    setLocOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    await locationsApi.remove(l.id);
                    qc.invalidateQueries({ queryKey: ["locations"] });
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Offer Popup</h2>
          <Button
            onClick={() => {
              setOfferForm({
                title: "",
                description: "",
                image: "",
                active: true,
              });
              setOfferOpen(true);
            }}
          >
            Add Offer
          </Button>
        </div>
        <div className="space-y-2">
          {offers.map((o: Offer) => (
            <div
              key={o.id}
              className="flex items-center justify-between rounded-lg bg-black/40 px-3 py-3"
            >
              <div>
                <p className="font-bold">{o.title}</p>
                <p className="text-sm text-zinc-400">{o.description}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (o.active) await offersApi.disable(o.id);
                    else await offersApi.enable(o.id);
                    qc.invalidateQueries({ queryKey: ["offers"] });
                  }}
                >
                  {o.active ? "Disable" : "Enable"}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    await offersApi.remove(o.id);
                    qc.invalidateQueries({ queryKey: ["offers"] });
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={locOpen} onOpenChange={setLocOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLoc ? "Edit Location" : "Add Location"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={locForm.name}
                onChange={(e) =>
                  setLocForm({ ...locForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Delivery Charge</Label>
              <Input
                type="number"
                value={locForm.delivery_charge}
                onChange={(e) =>
                  setLocForm({
                    ...locForm,
                    delivery_charge: Number(e.target.value),
                  })
                }
              />
            </div>
            <Button className="w-full" onClick={saveLocation}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Offer Popup</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={offerForm.title}
                onChange={(e) =>
                  setOfferForm({ ...offerForm, title: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                value={offerForm.description}
                onChange={(e) =>
                  setOfferForm({ ...offerForm, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Image URL</Label>
              <Input
                value={offerForm.image}
                onChange={(e) =>
                  setOfferForm({ ...offerForm, image: e.target.value })
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={offerForm.active}
                onCheckedChange={(v) =>
                  setOfferForm({ ...offerForm, active: v })
                }
              />
              Active
            </label>
            <Button className="w-full" onClick={saveOffer}>
              Save Offer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
