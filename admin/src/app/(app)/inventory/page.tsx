"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Plus, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { RecipesPanel } from "@/components/recipes-panel";
import { Badge } from "@/components/ui/badge";
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
import { formatPrice, formatStock } from "@/lib/utils";
import type { InventoryItem, Product } from "@/lib/types";
import { inventoryApi, inventoryTransactionsApi, productsApi } from "@/services/api";

type Tab = "stock" | "wastage" | "history" | "recipes";

type RowEdit = {
  purchaseUnit: string;
  unitsPerPurchase: number;
  /** Min stock in purchase units (easier for staff). */
  minStockPurchase: string;
  buyQty: string;
  buyCost: string;
  dirty: boolean;
};

type TxRow = {
  id: string;
  itemName: string;
  unit: string;
  quantity: number;
  type: string;
  reason: string;
  createdAt: string;
  totalCost?: number;
  balanceAfter?: number;
};

const UNIT_KINDS = ["WEIGHT", "VOLUME", "COUNT"] as const;

const PURCHASE_UNITS_BY_KIND: Record<string, string[]> = {
  WEIGHT: ["KG", "g", "Packet", "Bag"],
  VOLUME: ["Litre", "ml", "Bottle", "Can"],
  COUNT: ["pcs", "Carton", "Dozen", "Packet", "Box"],
};

function baseUnitForKind(kind: string) {
  switch (kind) {
    case "VOLUME":
      return "ml";
    case "COUNT":
      return "pcs";
    default:
      return "g";
  }
}

function defaultPurchaseUnit(kind: string) {
  switch (kind) {
    case "VOLUME":
      return "Litre";
    case "COUNT":
      return "pcs";
    default:
      return "KG";
  }
}

function defaultUnitsPerPurchase(purchaseUnit: string): number {
  const pu = purchaseUnit.toLowerCase().trim();
  if (["kg", "kilogram", "kilo"].includes(pu)) return 1000;
  if (["l", "litre", "liter", "ltr"].includes(pu)) return 1000;
  if (["carton", "case"].includes(pu)) return 24;
  if (pu === "dozen") return 12;
  return 1;
}

function toPurchaseQty(baseQty: number, unitsPerPurchase: number) {
  const upp = Number(unitsPerPurchase || 1);
  if (upp > 1) return baseQty / upp;
  return baseQty;
}

function toBaseQty(purchaseQty: number, unitsPerPurchase: number) {
  const upp = Number(unitsPerPurchase || 1);
  return Math.round(purchaseQty * upp);
}

function stockTone(item: InventoryItem): "success" | "warning" | "danger" {
  if (item.currentStock < 0 || item.currentStock === 0) return "danger";
  if (item.currentStock <= item.minimumStock) return "warning";
  return "success";
}

function emptyRow(item: InventoryItem): RowEdit {
  return {
    purchaseUnit: item.purchaseUnit || item.unit || "KG",
    unitsPerPurchase: item.unitsPerPurchase || 1,
    minStockPurchase: String(
      Number(
        toPurchaseQty(item.minimumStock, item.unitsPerPurchase || 1).toFixed(3),
      ),
    ),
    buyQty: "",
    buyCost: "",
    dirty: false,
  };
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("stock");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("tab");
    if (
      raw === "recipes" ||
      raw === "wastage" ||
      raw === "history" ||
      raw === "stock"
    ) {
      setTab(raw);
    }
  }, []);

  const selectTab = (id: Tab) => {
    setTab(id);
    router.replace(id === "stock" ? "/inventory" : `/inventory?tab=${id}`);
  };
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [rows, setRows] = useState<Record<string, RowEdit>>({});
  const [query, setQuery] = useState("");

  const [openAdd, setOpenAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addKind, setAddKind] = useState<string>("WEIGHT");
  const [addUnit, setAddUnit] = useState("KG");
  const [addOpening, setAddOpening] = useState("0");
  const [addMin, setAddMin] = useState("0");

  const [detail, setDetail] = useState<InventoryItem | null>(null);

  const [wastageMode, setWastageMode] = useState<"ingredient" | "product">(
    "product",
  );
  const [wastageItemId, setWastageItemId] = useState("");
  const [wastageQty, setWastageQty] = useState("");
  const [wastageReason, setWastageReason] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [wastageProductId, setWastageProductId] = useState("");
  const [wastageSizeId, setWastageSizeId] = useState("");
  const [wastageProductQty, setWastageProductQty] = useState("1");
  const [historyRows, setHistoryRows] = useState<TxRow[]>([]);
  const [wastageRows, setWastageRows] = useState<TxRow[]>([]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === wastageProductId) || null,
    [products, wastageProductId],
  );
  const productSizes = selectedProduct?.pizzaSizes || [];

  const dirtyCount = useMemo(
    () => Object.values(rows).filter((r) => r.dirty).length,
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [items, query]);

  const syncRows = (list: InventoryItem[]) => {
    const next: Record<string, RowEdit> = {};
    for (const item of list) next[item.id] = emptyRow(item);
    setRows(next);
  };

  const applyList = (list: InventoryItem[]) => {
    setItems(list);
    syncRows(list);
  };

  const loadSideTabs = async () => {
    const [allTx, wasteTx] = await Promise.all([
      inventoryTransactionsApi.list(),
      inventoryTransactionsApi.list(undefined, "WASTAGE"),
    ]);
    const map = (
      r: Awaited<ReturnType<typeof inventoryTransactionsApi.list>>[number],
    ): TxRow => ({
      id: r.id,
      itemName: r.inventory?.name || r.inventory_id,
      unit: r.inventory?.unit || "",
      quantity: r.quantity,
      type: r.transaction_type,
      reason: r.reason,
      createdAt: r.created_at,
      totalCost: r.total_cost,
      balanceAfter: r.balance_after,
    });
    setHistoryRows(allTx.map(map));
    setWastageRows(wasteTx.map(map));
  };

  const { isLoading: loading, isError, error } = useQuery({
    queryKey: ["inventory-page"],
    staleTime: 30_000,
    queryFn: async () => {
      const list = await inventoryApi.list();
      applyList(list);
      await loadSideTabs();
      const menu = await productsApi.list().catch(() => [] as Product[]);
      setProducts(menu.filter((p) => p.available !== false));
      return list;
    },
  });

  useEffect(() => {
    if (isError) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load inventory",
      );
    }
  }, [isError, error]);

  const refresh = async () => {
    const list = await inventoryApi.list();
    applyList(list);
    await queryClient.invalidateQueries({ queryKey: ["inventory-page"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const patchRow = (id: string, patch: Partial<RowEdit>) => {
    setRows((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || emptyRow(items.find((i) => i.id === id)!)), ...patch, dirty: true },
    }));
  };

  const saveAll = async () => {
    const dirtyIds = Object.entries(rows)
      .filter(([, r]) => r.dirty)
      .map(([id]) => id);
    if (!dirtyIds.length) {
      toast.message("Nothing to save");
      return;
    }

    const payload = [];
    for (const id of dirtyIds) {
      const item = items.find((i) => i.id === id);
      const row = rows[id];
      if (!item || !row) continue;

      const buyQty = Number(row.buyQty || 0);
      const buyCost = Number(row.buyCost || 0);
      if (buyQty < 0 || buyCost < 0) {
        toast.error(`${item.name}: today bought / cost cannot be negative`);
        return;
      }
      if (buyQty > 0 && buyCost <= 0) {
        toast.error(`${item.name}: enter the money you paid for today's buy`);
        return;
      }

      const minPurchase = Number(row.minStockPurchase || 0);
      if (minPurchase < 0) {
        toast.error(`${item.name}: min stock cannot be negative`);
        return;
      }

      payload.push({
        inventoryId: id,
        purchaseUnit: row.purchaseUnit,
        unitsPerPurchase: row.unitsPerPurchase,
        minimumStock: toBaseQty(minPurchase, row.unitsPerPurchase),
        buyQty,
        buyCost,
      });
    }

    try {
      setSaving(true);
      await inventoryApi.bulkSave(payload);
      toast.success(`Saved ${payload.length} item(s)`);
      await refresh();
      await loadSideTabs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const createItem = async () => {
    const name = addName.trim();
    if (!name) {
      toast.error("Enter item name");
      return;
    }
    const upp = defaultUnitsPerPurchase(addUnit);
    const openingPurchase = Number(addOpening || 0);
    const minPurchase = Number(addMin || 0);
    try {
      await inventoryApi.create({
        name,
        category: "",
        unitKind: addKind,
        unit: baseUnitForKind(addKind),
        purchaseUnit: addUnit,
        unitsPerPurchase: upp,
        currentStock: toBaseQty(openingPurchase, upp),
        minimumStock: toBaseQty(minPurchase, upp),
        purchasePrice: 0,
        supplier: "",
        isActive: true,
      });
      toast.success("Item added");
      setOpenAdd(false);
      setAddName("");
      setAddOpening("0");
      setAddMin("0");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add item");
    }
  };

  const removeItem = async (item: InventoryItem) => {
    if (!confirm(`Delete ${item.name}? Only if unused in recipes.`)) return;
    try {
      await inventoryApi.remove(item.id);
      toast.success("Deleted");
      setDetail(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const saveWastage = async () => {
    if (!wastageItemId) {
      toast.error("Select an item");
      return;
    }
    const item = items.find((i) => i.id === wastageItemId);
    const qtyPurchase = Number(wastageQty || 0);
    if (!item || qtyPurchase <= 0) {
      toast.error("Enter wastage quantity");
      return;
    }
    try {
      await inventoryApi.wastage(
        wastageItemId,
        toBaseQty(qtyPurchase, item.unitsPerPurchase || 1),
        wastageReason.trim() || "Wastage",
      );
      toast.success("Wastage recorded");
      setWastageQty("");
      setWastageReason("");
      await refresh();
      await loadSideTabs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wastage failed");
    }
  };

  const saveProductWastage = async () => {
    if (!wastageProductId) {
      toast.error("Select a menu product (e.g. pizza)");
      return;
    }
    if (productSizes.length > 0 && !wastageSizeId) {
      toast.error("Select the size that was wasted");
      return;
    }
    const qty = Math.max(1, Math.round(Number(wastageProductQty || 1)));
    try {
      const result = await inventoryApi.productWastage({
        productId: wastageProductId,
        productSizeId: wastageSizeId || undefined,
        quantity: qty,
        reason: wastageReason.trim() || "Product wastage / staff meal",
      });
      const summary = (result.lines || [])
        .map((l) => `${l.inventory_name} (${l.quantity_base}${l.unit})`)
        .join(", ");
      toast.success(
        `Deducted recipe for ${result.quantity}× ${result.product_name}${
          summary ? `: ${summary}` : ""
        }`,
      );
      setWastageProductQty("1");
      setWastageReason("");
      await refresh();
      await loadSideTabs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Product wastage failed");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Update stock on one page. Today buy adds stock + average cost (not an expense)."
        action={
          tab === "stock" ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setOpenAdd(true)}>
                <Plus className="h-4 w-4" />
                Add item
              </Button>
              <Button onClick={() => void saveAll()} disabled={saving || !dirtyCount}>
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : `Save all${dirtyCount ? ` (${dirtyCount})` : ""}`}
              </Button>
            </div>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["stock", "Stock"],
            ["recipes", "Recipes"],
            ["wastage", "Wastage"],
            ["history", "History"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => selectTab(id)}
            className={`rounded-lg px-4 py-2 text-sm font-bold ${
              tab === id
                ? "bg-orange-500 text-black"
                : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "recipes" ? <RecipesPanel /> : null}

      {loading && tab !== "recipes" ? (
        <p className="text-zinc-400">Loading inventory…</p>
      ) : null}

      {!loading && tab === "stock" ? (
        <div className="space-y-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              className="pl-9"
              placeholder="Search item…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-900/80 text-zinc-400">
                <tr>
                  <th className="px-3 py-3 font-semibold">Item</th>
                  <th className="px-3 py-3 font-semibold">Unit</th>
                  <th className="px-3 py-3 font-semibold">Current stock</th>
                  <th className="px-3 py-3 font-semibold">Min stock</th>
                  <th className="px-3 py-3 font-semibold">Today bought</th>
                  <th className="px-3 py-3 font-semibold">Today cost (Rs)</th>
                  <th className="px-3 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const row = rows[item.id] || emptyRow(item);
                  const units =
                    PURCHASE_UNITS_BY_KIND[item.unitKind] ||
                    PURCHASE_UNITS_BY_KIND.WEIGHT;
                  const newStockPreview =
                    item.currentStock +
                    toBaseQty(Number(row.buyQty || 0), row.unitsPerPurchase);
                  return (
                    <tr
                      key={item.id}
                      className="border-t border-zinc-800 hover:bg-zinc-900/40"
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-left font-bold text-white hover:text-orange-400"
                          onClick={() => setDetail(item)}
                        >
                          {item.name}
                        </button>
                        <div className="mt-1">
                          <Badge tone={stockTone(item)}>
                            {item.currentStock < 0
                              ? "Negative"
                              : item.currentStock === 0
                                ? "Out"
                                : item.currentStock <= item.minimumStock
                                  ? "Low"
                                  : "OK"}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={row.purchaseUnit}
                          onValueChange={(v) =>
                            patchRow(item.id, {
                              purchaseUnit: v,
                              unitsPerPurchase: defaultUnitsPerPurchase(v),
                            })
                          }
                        >
                          <SelectTrigger className="w-[110px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {units.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 font-semibold text-zinc-200">
                        {formatStock(
                          item.currentStock,
                          item.unit,
                          row.purchaseUnit,
                          row.unitsPerPurchase,
                        )}
                        {Number(row.buyQty || 0) > 0 ? (
                          <p className="text-xs text-emerald-400">
                            →{" "}
                            {formatStock(
                              newStockPreview,
                              item.unit,
                              row.purchaseUnit,
                              row.unitsPerPurchase,
                            )}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="w-[100px]"
                          inputMode="decimal"
                          value={row.minStockPurchase}
                          onChange={(e) =>
                            patchRow(item.id, {
                              minStockPurchase: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="w-[110px]"
                          inputMode="decimal"
                          placeholder="0"
                          value={row.buyQty}
                          onChange={(e) =>
                            patchRow(item.id, { buyQty: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="w-[120px]"
                          inputMode="numeric"
                          placeholder="0"
                          value={row.buyCost}
                          onChange={(e) =>
                            patchRow(item.id, { buyCost: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.dirty ? (
                          <span className="text-xs font-bold text-orange-400">
                            edited
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-8 text-center text-zinc-500"
                    >
                      No inventory items yet. Click “Add item”.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">
            Tip: fill “Today bought” + “Today cost”, then Save all. Stock goes up
            and average cost updates automatically. Rent/bills stay in Expenses.
          </p>
        </div>
      ) : null}

      {!loading && tab === "wastage" ? (
        <div className="max-w-xl space-y-4 rounded-xl border border-zinc-800 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setWastageMode("product")}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${
                wastageMode === "product"
                  ? "bg-orange-500 text-black"
                  : "bg-zinc-900 text-zinc-300"
              }`}
            >
              Finished product (pizza)
            </button>
            <button
              type="button"
              onClick={() => setWastageMode("ingredient")}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${
                wastageMode === "ingredient"
                  ? "bg-orange-500 text-black"
                  : "bg-zinc-900 text-zinc-300"
              }`}
            >
              Single ingredient
            </button>
          </div>

          {wastageMode === "product" ? (
            <>
              <p className="text-sm text-zinc-400">
                Pick a menu item (e.g. Chicken Tikka pizza). The system deducts
                every recipe ingredient automatically — no need to enter cheese,
                dough, etc. one by one. Recipes must be set under Recipes first.
              </p>
              <div className="space-y-2">
                <Label>Product</Label>
                <Select
                  value={wastageProductId || undefined}
                  onValueChange={(id) => {
                    setWastageProductId(id);
                    setWastageSizeId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select pizza / item" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {productSizes.length > 0 ? (
                <div className="space-y-2">
                  <Label>Size</Label>
                  <Select
                    value={wastageSizeId || undefined}
                    onValueChange={setWastageSizeId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      {productSizes
                        .filter((s) => Boolean(s.id))
                        .map((s) => (
                          <SelectItem key={s.id!} value={s.id!}>
                            {s.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>How many wasted / staff meals</Label>
                <Input
                  inputMode="numeric"
                  value={wastageProductQty}
                  onChange={(e) => setWastageProductQty(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  value={wastageReason}
                  onChange={(e) => setWastageReason(e.target.value)}
                  placeholder="Burnt / staff meal / customer return…"
                />
              </div>
              <Button onClick={() => void saveProductWastage()}>
                Deduct recipe stock
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Ingredient</Label>
                <Select
                  value={wastageItemId || undefined}
                  onValueChange={setWastageItemId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  Quantity spoiled (
                  {items.find((i) => i.id === wastageItemId)?.purchaseUnit ||
                    "unit"}
                  )
                </Label>
                <Input
                  inputMode="decimal"
                  value={wastageQty}
                  onChange={(e) => setWastageQty(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  value={wastageReason}
                  onChange={(e) => setWastageReason(e.target.value)}
                  placeholder="Expired / damaged…"
                />
              </div>
              <Button onClick={() => void saveWastage()}>Record wastage</Button>
            </>
          )}

          <div className="overflow-x-auto pt-4">
            <table className="min-w-full text-left text-sm">
              <thead className="text-zinc-400">
                <tr>
                  <th className="py-2">When</th>
                  <th className="py-2">Item</th>
                  <th className="py-2">Qty</th>
                  <th className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {wastageRows.slice(0, 30).map((r) => (
                  <tr key={r.id} className="border-t border-zinc-800">
                    <td className="py-2 text-zinc-400">
                      {new Date(r.createdAt).toLocaleString("en-PK")}
                    </td>
                    <td className="py-2">{r.itemName}</td>
                    <td className="py-2">{r.quantity}</td>
                    <td className="py-2 text-zinc-400">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!loading && tab === "history" ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-900/80 text-zinc-400">
              <tr>
                <th className="px-3 py-3">When</th>
                <th className="px-3 py-3">Item</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Qty</th>
                <th className="px-3 py-3">Cost</th>
                <th className="px-3 py-3">Balance</th>
                <th className="px-3 py-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.slice(0, 80).map((r) => (
                <tr key={r.id} className="border-t border-zinc-800">
                  <td className="px-3 py-2 text-zinc-400">
                    {new Date(r.createdAt).toLocaleString("en-PK")}
                  </td>
                  <td className="px-3 py-2">{r.itemName}</td>
                  <td className="px-3 py-2">
                    <Badge>{r.type}</Badge>
                  </td>
                  <td className="px-3 py-2">{r.quantity}</td>
                  <td className="px-3 py-2">
                    {r.totalCost != null ? formatPrice(r.totalCost) : "—"}
                  </td>
                  <td className="px-3 py-2">{r.balanceAfter ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add inventory item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Cheese, Flour…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={addKind}
                  onValueChange={(v) => {
                    setAddKind(v);
                    setAddUnit(defaultPurchaseUnit(v));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k === "WEIGHT"
                          ? "Weight"
                          : k === "VOLUME"
                            ? "Volume"
                            : "Count"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Buy unit</Label>
                <Select value={addUnit} onValueChange={setAddUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(PURCHASE_UNITS_BY_KIND[addKind] || []).map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Opening stock ({addUnit})</Label>
                <Input
                  inputMode="decimal"
                  value={addOpening}
                  onChange={(e) => setAddOpening(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Min stock ({addUnit})</Label>
                <Input
                  inputMode="decimal"
                  value={addMin}
                  onChange={(e) => setAddMin(e.target.value)}
                />
              </div>
            </div>
            <Button className="w-full" onClick={() => void createItem()}>
              Save item
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-zinc-400">Current stock: </span>
                {formatStock(
                  detail.currentStock,
                  detail.unit,
                  detail.purchaseUnit,
                  detail.unitsPerPurchase,
                )}
              </p>
              <p>
                <span className="text-zinc-400">Stock value: </span>
                {formatPrice(detail.stockValue)}
              </p>
              <p>
                <span className="text-zinc-400">Last buy price / unit: </span>
                {formatPrice(detail.purchasePrice)}
              </p>
              <p className="text-zinc-500">
                Edit stock buys and min stock on the main table, then Save all.
              </p>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => void removeItem(detail)}
              >
                <Trash2 className="h-4 w-4" />
                Delete item
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
