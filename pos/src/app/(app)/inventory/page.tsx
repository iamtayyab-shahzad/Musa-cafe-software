"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatPrice, formatStock } from "@/lib/utils";
import {
  inventoryApi,
  inventoryTransactionsApi,
  productsApi,
  recipesApi,
} from "@/services/api";
import type { InventoryItem, Product, Recipe } from "@/types";

type Tab = "stock" | "recipes" | "wastage" | "history";

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

type RecipeLine = {
  key: string;
  inventoryId: string;
  quantity: number;
  inventoryName?: string;
  unit?: string;
};

const ALL_SIZES = "__all__";

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

function stockBadge(item: InventoryItem) {
  if (item.stock < 0) return { label: "Negative", className: "bg-red-600/20 text-red-400" };
  if (item.stock === 0) return { label: "Out", className: "bg-red-600/20 text-red-400" };
  if (item.stock <= item.minimum_stock)
    return { label: "Low", className: "bg-amber-500/20 text-amber-400" };
  return { label: "OK", className: "bg-emerald-500/20 text-emerald-400" };
}

function emptyRow(item: InventoryItem): RowEdit {
  const upp = item.units_per_purchase || 1;
  return {
    purchaseUnit: item.purchase_unit || item.unit || "KG",
    unitsPerPurchase: upp,
    minStockPurchase: String(
      Number(toPurchaseQty(item.minimum_stock, upp).toFixed(3)),
    ),
    buyQty: "",
    buyCost: "",
    dirty: false,
  };
}

function lineKey() {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function mapTx(
  r: Awaited<ReturnType<typeof inventoryTransactionsApi.list>>[number],
): TxRow {
  return {
    id: r.id,
    itemName: r.inventory?.name || r.inventory_id,
    unit: r.inventory?.unit || "",
    quantity: r.quantity,
    type: r.transaction_type,
    reason: r.reason,
    createdAt: r.created_at,
    totalCost: r.total_cost,
    balanceAfter: r.balance_after,
  };
}

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>("stock");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  // Recipes tab state
  const [recipeQuery, setRecipeQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [sizeTab, setSizeTab] = useState(ALL_SIZES);
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [addInventoryId, setAddInventoryId] = useState("");
  const [addQty, setAddQty] = useState(0);
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [recipeDirty, setRecipeDirty] = useState(false);

  const selectedWastageProduct = useMemo(
    () => products.find((p) => p.id === wastageProductId) || null,
    [products, wastageProductId],
  );
  const productSizes = selectedWastageProduct?.sizes || [];

  const selectedRecipeProduct = products.find(
    (p) => p.id === selectedProductId,
  );
  const recipeSizes = selectedRecipeProduct?.sizes || [];

  const dirtyCount = useMemo(
    () => Object.values(rows).filter((r) => r.dirty).length,
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [items, query]);

  const filteredProducts = useMemo(() => {
    const q = recipeQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, recipeQuery]);

  const invById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );

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
    setHistoryRows(allTx.map(mapTx));
    setWastageRows(wasteTx.map(mapTx));
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const list = await inventoryApi.list();
      applyList(list);
      await loadSideTabs().catch(() => {
        setHistoryRows([]);
        setWastageRows([]);
      });
      const menu = await productsApi.list().catch(() => [] as Product[]);
      const available = menu.filter((p) => p.available !== false);
      setProducts(available);
      if (available.length && !selectedProductId) {
        setSelectedProductId(available[0].id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    const list = await inventoryApi.list();
    applyList(list);
  };

  const patchRow = (id: string, patch: Partial<RowEdit>) => {
    setRows((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || emptyRow(items.find((i) => i.id === id)!)),
        ...patch,
        dirty: true,
      },
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

    const payload: {
      inventoryId: string;
      purchaseUnit: string;
      unitsPerPurchase: number;
      minimumStock: number;
      buyQty: number;
      buyCost: number;
    }[] = [];

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
        unit_kind: addKind,
        unit: baseUnitForKind(addKind),
        purchase_unit: addUnit,
        units_per_purchase: upp,
        stock: toBaseQty(openingPurchase, upp),
        minimum_stock: toBaseQty(minPurchase, upp),
        purchase_price: 0,
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
        toBaseQty(qtyPurchase, item.units_per_purchase || 1),
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
      toast.error("Select a menu product");
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

  const loadRecipesForProduct = async (productId: string, sizeId: string) => {
    const rows = (await recipesApi.listByProduct(productId)) as Recipe[];
    const filtered = rows.filter((r) => {
      if (sizeId === ALL_SIZES) return !r.product_size_id;
      return r.product_size_id === sizeId;
    });
    setLines(
      filtered.map((r) => ({
        key: r.id || lineKey(),
        inventoryId: r.inventory_id,
        quantity: Number(r.quantity_required || 0),
        inventoryName: r.inventory?.name,
        unit: r.inventory?.unit,
      })),
    );
    setRecipeDirty(false);
  };

  useEffect(() => {
    if (!selectedProductId) return;
    setSizeTab(ALL_SIZES);
  }, [selectedProductId]);

  useEffect(() => {
    if (!selectedProductId || tab !== "recipes") return;
    loadRecipesForProduct(selectedProductId, sizeTab).catch((e) =>
      toast.error(e instanceof Error ? e.message : "Failed to load recipe"),
    );
  }, [selectedProductId, sizeTab, tab]);

  const addLine = () => {
    if (!addInventoryId) {
      toast.error("Select an inventory item");
      return;
    }
    if (Number(addQty) <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }
    if (lines.some((l) => l.inventoryId === addInventoryId)) {
      toast.error("Item already in this recipe — edit the quantity instead");
      return;
    }
    const inv = invById.get(addInventoryId);
    setLines((prev) => [
      ...prev,
      {
        key: lineKey(),
        inventoryId: addInventoryId,
        quantity: Number(addQty),
        inventoryName: inv?.name,
        unit: inv?.unit,
      },
    ]);
    setAddQty(0);
    setRecipeDirty(true);
  };

  const updateQty = (key: string, quantity: number) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity } : l)),
    );
    setRecipeDirty(true);
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setRecipeDirty(true);
  };

  const saveRecipeSet = async () => {
    if (!selectedProductId) return;
    if (lines.some((l) => !l.inventoryId || l.quantity <= 0)) {
      toast.error("Every line needs a valid quantity");
      return;
    }
    setRecipeSaving(true);
    try {
      await recipesApi.replaceSet({
        product_id: selectedProductId,
        product_size_id: sizeTab === ALL_SIZES ? null : sizeTab,
        lines: lines.map((l) => ({
          inventory_id: l.inventoryId,
          quantity_required: Number(l.quantity),
        })),
      });
      toast.success("Recipe saved");
      setRecipeDirty(false);
      await loadRecipesForProduct(selectedProductId, sizeTab);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setRecipeSaving(false);
    }
  };

  const selectedAddItem = invById.get(addInventoryId);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Inventory</h1>
          <p className="text-sm text-zinc-400">
            Update stock, recipes, wastage, and history in one place.
          </p>
        </div>
        {tab === "stock" ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setOpenAdd(true)}>
              <Plus className="h-4 w-4" />
              Add item
            </Button>
            <Button
              onClick={() => void saveAll()}
              disabled={saving || !dirtyCount}
            >
              <Save className="h-4 w-4" />
              {saving
                ? "Saving…"
                : `Save all${dirtyCount ? ` (${dirtyCount})` : ""}`}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
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
            onClick={() => setTab(id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-bold",
              tab === id
                ? "bg-orange-500 text-black"
                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <p className="text-zinc-400">Loading inventory…</p> : null}

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
                    PURCHASE_UNITS_BY_KIND[item.unit_kind || "WEIGHT"] ||
                    PURCHASE_UNITS_BY_KIND.WEIGHT;
                  const newStockPreview =
                    item.stock +
                    toBaseQty(Number(row.buyQty || 0), row.unitsPerPurchase);
                  const badge = stockBadge(item);
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
                          <span
                            className={cn(
                              "inline-block rounded px-2 py-0.5 text-xs font-bold",
                              badge.className,
                            )}
                          >
                            {badge.label}
                          </span>
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
                          item.stock,
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
            and average cost updates automatically.
          </p>
        </div>
      ) : null}

      {!loading && tab === "recipes" ? (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <div className="border-b border-zinc-800 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  className="pl-9"
                  placeholder="Search products…"
                  value={recipeQuery}
                  onChange={(e) => setRecipeQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {filteredProducts.map((p) => {
                const active = p.id === selectedProductId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProductId(p.id)}
                    className={cn(
                      "block w-full border-b border-zinc-900 px-4 py-3 text-left text-sm font-bold transition-colors",
                      active
                        ? "bg-orange-500 text-black"
                        : "text-zinc-300 hover:bg-zinc-900",
                    )}
                  >
                    {p.name}
                  </button>
                );
              })}
              {!filteredProducts.length ? (
                <p className="px-4 py-8 text-center text-sm text-zinc-500">
                  No products found.
                </p>
              ) : null}
            </div>
          </div>

          <div>
            {!selectedRecipeProduct ? (
              <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-zinc-500">
                Select a product to edit its recipe.
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black">
                      {selectedRecipeProduct.name}
                    </h2>
                    <p className="text-sm text-zinc-400">
                      Quantities are in base stock units
                    </p>
                  </div>
                  <Button
                    disabled={recipeSaving || !recipeDirty}
                    onClick={() => void saveRecipeSet()}
                  >
                    <Save className="h-4 w-4" />
                    {recipeSaving ? "Saving…" : "Save Recipe"}
                  </Button>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSizeTab(ALL_SIZES)}
                    className={cn(
                      "rounded-lg px-4 py-2 text-sm font-bold",
                      sizeTab === ALL_SIZES
                        ? "bg-orange-500 text-black"
                        : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800",
                    )}
                  >
                    All sizes
                  </button>
                  {recipeSizes.map((s) => {
                    const active = sizeTab === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSizeTab(s.id)}
                        className={cn(
                          "rounded-lg px-4 py-2 text-sm font-bold",
                          active
                            ? "bg-orange-500 text-black"
                            : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800",
                        )}
                      >
                        {s.size}
                      </button>
                    );
                  })}
                </div>

                {recipeDirty ? (
                  <p className="mb-3 text-xs font-bold text-amber-400">
                    Unsaved changes
                  </p>
                ) : null}

                <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <h3 className="mb-3 font-bold">Add Ingredient</h3>
                  <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                    <div className="space-y-1">
                      <Label>Inventory item</Label>
                      <Select
                        value={addInventoryId || undefined}
                        onValueChange={setAddInventoryId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select item" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.name} ({i.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Qty
                        {selectedAddItem ? ` (${selectedAddItem.unit})` : ""}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={addQty}
                        onChange={(e) => setAddQty(Number(e.target.value))}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button type="button" onClick={addLine}>
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-zinc-800">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="bg-zinc-950 text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">Ingredient</th>
                        <th className="px-4 py-3">Quantity</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => {
                        const inv = invById.get(line.inventoryId);
                        const unit = inv?.unit || line.unit || "";
                        return (
                          <tr
                            key={line.key}
                            className="border-t border-zinc-800"
                          >
                            <td className="px-4 py-3 font-bold">
                              {inv?.name ||
                                line.inventoryName ||
                                line.inventoryId}
                              <span className="mt-1 block text-xs font-normal text-zinc-500">
                                Stock{" "}
                                {inv
                                  ? formatStock(
                                      inv.stock,
                                      inv.unit,
                                      inv.purchase_unit,
                                      inv.units_per_purchase,
                                    )
                                  : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Input
                                  className="max-w-[140px]"
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={line.quantity}
                                  onChange={(e) =>
                                    updateQty(
                                      line.key,
                                      Number(e.target.value),
                                    )
                                  }
                                />
                                <span className="text-sm text-zinc-400">
                                  {unit}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => removeLine(line.key)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!lines.length ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-10 text-center text-zinc-500"
                          >
                            No ingredients for this size yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {!loading && tab === "wastage" ? (
        <div className="max-w-xl space-y-4 rounded-xl border border-zinc-800 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setWastageMode("product")}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-bold",
                wastageMode === "product"
                  ? "bg-orange-500 text-black"
                  : "bg-zinc-900 text-zinc-300",
              )}
            >
              Finished product
            </button>
            <button
              type="button"
              onClick={() => setWastageMode("ingredient")}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-bold",
                wastageMode === "ingredient"
                  ? "bg-orange-500 text-black"
                  : "bg-zinc-900 text-zinc-300",
              )}
            >
              Single ingredient
            </button>
          </div>

          {wastageMode === "product" ? (
            <>
              <p className="text-sm text-zinc-400">
                Pick a menu item. The system deducts every recipe ingredient
                automatically. Recipes must be set under Recipes first.
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
                    <SelectValue placeholder="Select product" />
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
                      {productSizes.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.size}
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
                  {items.find((i) => i.id === wastageItemId)?.purchase_unit ||
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
                {!wastageRows.length ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-6 text-center text-zinc-500"
                    >
                      No wastage recorded yet.
                    </td>
                  </tr>
                ) : null}
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
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-bold text-zinc-300">
                      {r.type}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.quantity}</td>
                  <td className="px-3 py-2">
                    {r.totalCost != null ? formatPrice(r.totalCost) : "—"}
                  </td>
                  <td className="px-3 py-2">{r.balanceAfter ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{r.reason}</td>
                </tr>
              ))}
              {!historyRows.length ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-zinc-500"
                  >
                    No transaction history yet.
                  </td>
                </tr>
              ) : null}
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
                  detail.stock,
                  detail.unit,
                  detail.purchase_unit,
                  detail.units_per_purchase,
                )}
              </p>
              <p>
                <span className="text-zinc-400">Last buy price / unit: </span>
                {formatPrice(detail.purchase_price)}
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
