"use client";

import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assertImageFieldSafe,
  prepareProductImage,
} from "@/lib/image-upload";
import { formatPrice } from "@/lib/utils";
import {
  isPizzaCategoryName,
  isPizzaProduct,
  isPizzaSizeLabel,
  pizzaSellableSizes,
} from "@/lib/is-pizza";
import { categoriesApi, productsApi } from "@/services/api";
import type { Category, Product } from "@/types";

type SizeRow = { key: string; id?: string; label: string; price: number };

function newSizeRow(
  partial: Omit<SizeRow, "key"> & { key?: string } = { label: "", price: 0 },
): SizeRow {
  return {
    key: partial.key || crypto.randomUUID(),
    id: partial.id,
    label: partial.label,
    price: partial.price,
  };
}

const emptyForm = {
  name: "",
  description: "",
  image: "",
  category_id: "",
  featured: false,
  available: true,
  display_order: 0,
  basePrice: 0,
};

export default function ProductsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [useSizes, setUseSizes] = useState(true);
  const [sizes, setSizes] = useState<SizeRow[]>([
    newSizeRow({ label: "S", price: 0 }),
    newSizeRow({ label: "M", price: 0 }),
    newSizeRow({ label: "L", price: 0 }),
    newSizeRow({ label: "XL", price: 0 }),
  ]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: productsApi.list,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: categoriesApi.list,
  });

  const filtered = useMemo(
    () =>
      products.filter((p) =>
        p.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [products, q],
  );

  const categoryIsPizza = (categoryId: string) => {
    const cat = categories.find((c: Category) => c.id === categoryId);
    return isPizzaCategoryName(cat?.name);
  };

  const openCreate = () => {
    setEditing(null);
    const categoryId = categories[0]?.id || "";
    setForm({ ...emptyForm, category_id: categoryId });
    setUseSizes(categoryIsPizza(categoryId));
    setSizes([
      newSizeRow({ label: "S", price: 0 }),
      newSizeRow({ label: "M", price: 0 }),
      newSizeRow({ label: "L", price: 0 }),
      newSizeRow({ label: "XL", price: 0 }),
    ]);
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    const pizza = isPizzaProduct(p) || categoryIsPizza(p.category_id);
    setForm({
      name: p.name,
      description: p.description || "",
      image: p.image || "",
      category_id: p.category_id,
      featured: p.featured,
      available: p.available,
      display_order: p.display_order,
      basePrice: p.sizes?.[0]?.price || 0,
    });
    setUseSizes(pizza);
    const pizzaRows = pizzaSellableSizes(p.sizes).map((s) =>
      newSizeRow({ id: s.id, label: s.size, price: s.price }),
    );
    setSizes(
      pizza
        ? pizzaRows.length
          ? pizzaRows
          : [
              newSizeRow({ label: "S", price: 0 }),
              newSizeRow({ label: "M", price: 0 }),
              newSizeRow({ label: "L", price: 0 }),
              newSizeRow({ label: "XL", price: 0 }),
            ]
        : [
            newSizeRow({
              id: p.sizes?.[0]?.id,
              label: "Regular",
              price: p.sizes?.[0]?.price || 0,
            }),
          ],
    );
    setOpen(true);
  };

  const onImage = (file?: File | null) => {
    if (!file) return;
    void (async () => {
      try {
        toast.message("Uploading image…");
        const prepared = await prepareProductImage(file);
        setForm((f) => ({ ...f, image: prepared.url }));
        toast.success(
          `Image ready (~${Math.round(prepared.bytesApprox / 1024)}KB)`,
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Image upload failed",
        );
      }
    })();
  };

  const save = async () => {
    if (!form.name.trim() || !form.category_id) {
      toast.error("Name and category required");
      return;
    }
    try {
      assertImageFieldSafe(form.image);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image too large");
      return;
    }
    const pizzaSizes: SizeRow[] = useSizes
      ? sizes.filter((s) => s.label.trim() && isPizzaSizeLabel(s.label))
      : [newSizeRow({ label: "Regular", price: Number(form.basePrice) || 0 })];

    if (!pizzaSizes.length || pizzaSizes.every((s) => !s.price && s.price !== 0)) {
      toast.error("Add at least one size with a price");
      return;
    }
    if (pizzaSizes.some((s) => Number.isNaN(Number(s.price)))) {
      toast.error("All size prices must be numbers");
      return;
    }

    setSaving(true);
    try {
      const res = await productsApi.saveWithSizes({
        id: editing?.id,
        category_id: form.category_id,
        name: form.name,
        description: form.description,
        image: form.image,
        featured: form.featured,
        available: form.available,
        display_order: Number(form.display_order) || 0,
        sizes: pizzaSizes.map((s) => ({
          id: s.id,
          label: s.label.trim(),
          price: Number(s.price) || 0,
        })),
      });
      if (res.keptSizes?.length) {
        toast.message(
          `Saved. ${res.keptSizes.join(", ")} kept for old tickets and hidden on pizza cards.`,
        );
      } else {
        toast.success(
          res.offline
            ? res.message || "Product saved offline — will sync with prices"
            : editing
              ? "Product updated"
              : "Product created",
        );
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    try {
      await productsApi.remove(id);
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const toggle = async (p: Product, field: "available" | "featured") => {
    try {
      await productsApi.saveWithSizes({
        id: p.id,
        category_id: p.category_id,
        name: p.name,
        description: p.description || "",
        image: p.image || "",
        featured: field === "featured" ? !p.featured : p.featured,
        available: field === "available" ? !p.available : p.available,
        display_order: p.display_order,
        sizes: (p.sizes || []).map((s) => ({
          id: s.id,
          label: s.size,
          price: s.price,
        })),
      });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black">Products</h1>
        <div className="flex gap-2">
          <Input
            className="w-64"
            placeholder="Search..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button onClick={openCreate}>Add Product</Button>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="text-lg font-bold">{p.name}</p>
              <p className="text-sm text-zinc-400">
                {isPizzaProduct(p) && pizzaSellableSizes(p.sizes).length > 1
                  ? pizzaSellableSizes(p.sizes)
                      .map((s) => `${s.size} ${formatPrice(s.price)}`)
                      .join(" · ")
                  : formatPrice(
                      pizzaSellableSizes(p.sizes)[0]?.price ||
                        p.sizes?.[0]?.price ||
                        0,
                    )}
              </p>
              <div className="mt-2 flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <Switch
                    checked={p.available}
                    onCheckedChange={() => toggle(p, "available")}
                  />
                  Available
                </label>
                <label className="flex items-center gap-2">
                  <Switch
                    checked={p.featured}
                    onCheckedChange={() => toggle(p, "featured")}
                  />
                  Featured
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => openEdit(p)}>
                Edit
              </Button>
              <Button variant="danger" onClick={() => remove(p.id)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Product" : "Add Product"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                value={form.category_id}
                onValueChange={(v) => {
                  setForm({ ...form, category_id: v });
                  setUseSizes(categoryIsPizza(v));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Image</Label>
              <Input
                value={form.image}
                placeholder="Cloudinary URL after upload"
                onChange={(e) => setForm({ ...form, image: e.target.value })}
              />
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  onImage(file);
                }}
              />
              <p className="text-xs text-zinc-500">
                Compressed locally, then uploaded to Cloudinary.
              </p>
              {form.image.startsWith("https://") ? (
                <p className="text-xs text-emerald-500">Cloudinary image ready</p>
              ) : null}
            </div>

            {useSizes ? (
              <div className="space-y-2 rounded-lg border border-zinc-800 p-3">
                <Label>Sizes &amp; Prices</Label>
                {sizes.map((s, idx) => (
                  <div key={s.key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input
                      placeholder="Size"
                      value={s.label}
                      onChange={(e) => {
                        const next = [...sizes];
                        next[idx] = { ...s, label: e.target.value };
                        setSizes(next);
                      }}
                    />
                    <Input
                      type="number"
                      placeholder="Price"
                      value={s.price}
                      onChange={(e) => {
                        const next = [...sizes];
                        next[idx] = { ...s, price: Number(e.target.value) };
                        setSizes(next);
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setSizes(sizes.filter((_, i) => i !== idx))
                      }
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSizes([...sizes, newSizeRow()])}
                >
                  Add size
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Price</Label>
                <Input
                  type="number"
                  value={form.basePrice}
                  onChange={(e) =>
                    setForm({ ...form, basePrice: Number(e.target.value) })
                  }
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.available}
                  onCheckedChange={(v) => setForm({ ...form, available: v })}
                />
                Available
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.featured}
                  onCheckedChange={(v) => setForm({ ...form, featured: v })}
                />
                Featured / Status
              </label>
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Product"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
