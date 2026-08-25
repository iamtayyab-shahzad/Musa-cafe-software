"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatStock } from "@/lib/utils";
import type { InventoryItem, Product } from "@/lib/types";
import {
  inventoryApi,
  productsApi,
  recipesApi,
} from "@/services/api";

type RecipeLine = {
  key: string;
  inventoryId: string;
  quantity: number;
  inventoryName?: string;
  unit?: string;
};

type BackendRecipe = {
  id: string;
  product_id: string;
  product_size_id?: string | null;
  inventory_id: string;
  quantity_required: number;
  inventory?: { id: string; name: string; unit: string };
  product_size?: { id: string; size: string } | null;
};

const ALL_SIZES = "__all__";

function lineKey() {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Product → ingredient recipes. Embedded as Inventory → Recipes tab. */
export function RecipesPanel() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [sizeTab, setSizeTab] = useState<string>(ALL_SIZES);
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [addInventoryId, setAddInventoryId] = useState("");
  const [addQty, setAddQty] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [prods, inv] = await Promise.all([
          productsApi.list(),
          inventoryApi.list(),
        ]);
        if (cancelled) return;
        setProducts(prods);
        setInventory(inv);
        if (prods.length) setSelectedProductId(prods[0].id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load recipes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const sizes = selectedProduct?.pizzaSizes || [];

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  const loadRecipesForProduct = async (
    productId: string,
    sizeId: string,
  ) => {
    const rows = (await recipesApi.listByProduct(
      productId,
    )) as BackendRecipe[];
    const filtered = rows.filter((r) => {
      if (sizeId === ALL_SIZES) {
        return !r.product_size_id;
      }
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
    setDirty(false);
  };

  useEffect(() => {
    if (!selectedProductId) return;
    setSizeTab(ALL_SIZES);
  }, [selectedProductId]);

  useEffect(() => {
    if (!selectedProductId) return;
    loadRecipesForProduct(selectedProductId, sizeTab).catch((e) =>
      toast.error(e instanceof Error ? e.message : "Failed to load recipe"),
    );
  }, [selectedProductId, sizeTab]);

  const invById = useMemo(
    () => new Map(inventory.map((i) => [i.id, i])),
    [inventory],
  );

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
    setDirty(true);
  };

  const updateQty = (key: string, quantity: number) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity } : l)),
    );
    setDirty(true);
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setDirty(true);
  };

  const saveSet = async () => {
    if (!selectedProductId) return;
    if (
      lines.some(
        (l) =>
          !l.inventoryId ||
          !Number.isFinite(l.quantity) ||
          l.quantity <= 0 ||
          !Number.isInteger(l.quantity),
      )
    ) {
      toast.error("Every line needs a whole-number quantity in base units");
      return;
    }
    setSaving(true);
    try {
      await recipesApi.replaceSet({
        product_id: selectedProductId,
        product_size_id: sizeTab === ALL_SIZES ? null : sizeTab,
        lines: lines.map((l) => ({
          inventory_id: l.inventoryId,
          quantity_required: Math.round(Number(l.quantity)),
        })),
      });
      toast.success(
        lines.length === 0
          ? "Recipe cleared — sales will not deduct stock for this size"
          : "Recipe saved",
      );
      setDirty(false);
      await loadRecipesForProduct(selectedProductId, sizeTab);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const selectedAddItem = invById.get(addInventoryId);

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-zinc-400">
        Loading recipes...
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-zinc-400">
        Optional: link products to ingredients for automatic stock deduct and
        COGS. Leave empty until the shop gives exact amounts — sales still work.
      </p>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="!p-0 overflow-hidden">
          <div className="border-b border-zinc-800 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                className="pl-10"
                placeholder="Search products..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {filteredProducts.map((p) => {
              const active = p.id === selectedProductId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProductId(p.id)}
                  className={`block w-full border-b border-zinc-900 px-4 py-3 text-left text-sm font-bold transition-colors ${
                    active
                      ? "bg-orange-500 text-black"
                      : "text-zinc-300 hover:bg-zinc-900"
                  }`}
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
        </Card>

        <div>
          {!selectedProduct ? (
            <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-zinc-500">
              Select a product to edit its recipe.
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">{selectedProduct.name}</h2>
                  <p className="text-sm text-zinc-400">
                    Quantities are in base stock units
                  </p>
                </div>
                <Button disabled={saving || !dirty} onClick={saveSet}>
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save Recipe"}
                </Button>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSizeTab(ALL_SIZES)}
                  className={`rounded-lg px-4 py-2 text-sm font-bold ${
                    sizeTab === ALL_SIZES
                      ? "bg-orange-500 text-black"
                      : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  All sizes
                </button>
                {sizes
                  .filter((s): s is typeof s & { id: string } => Boolean(s.id))
                  .map((s) => {
                    const active = sizeTab === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSizeTab(s.id)}
                        className={`rounded-lg px-4 py-2 text-sm font-bold ${
                          active
                            ? "bg-orange-500 text-black"
                            : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
              </div>

              {dirty ? (
                <div className="mb-4">
                  <Badge tone="warning">Unsaved changes</Badge>
                </div>
              ) : null}

              <Card className="mb-4">
                <h3 className="mb-3 font-bold">Add Ingredient</h3>
                <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
                  <div className="space-y-2">
                    <Label>Inventory item</Label>
                    <Select
                      value={addInventoryId || undefined}
                      onValueChange={setAddInventoryId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent>
                        {inventory.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name} ({i.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Qty
                      {selectedAddItem ? ` (${selectedAddItem.unit})` : ""}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
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
              </Card>

              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full min-w-[560px] text-left">
                  <thead className="bg-zinc-950 text-sm uppercase text-zinc-500">
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
                            {inv?.name || line.inventoryName || line.inventoryId}
                            <span className="mt-1 block text-xs font-normal text-zinc-500">
                              Stock{" "}
                              {inv
                                ? formatStock(
                                    inv.currentStock,
                                    inv.unit,
                                    inv.purchaseUnit,
                                    inv.unitsPerPurchase,
                                  )
                                : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Input
                                className="max-w-[140px]"
                                type="number"
                                min={1}
                                step={1}
                                value={line.quantity}
                                onChange={(e) =>
                                  updateQty(line.key, Number(e.target.value))
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
                          <span className="mt-2 block text-xs text-zinc-600">
                            Sales still work, but stock will not deduct and
                            product wastage / per-item COGS stay at zero until
                            you add a recipe. Prefer &quot;All sizes&quot; for a
                            shared BOM, or set each size if quantities differ.
                          </span>
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
    </div>
  );
}
