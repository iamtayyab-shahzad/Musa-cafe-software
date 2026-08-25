"use client";

import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  flavorsForSlot,
  isDealProduct,
  parseDealPizzaSlots,
  type DealPizzaSlot,
} from "@/lib/deal-flavors";
import { getProducts } from "@/services/api";
import type { Product } from "@/types";

export type DealFlavorState = {
  /** Human-readable note, e.g. "Regular pizza flavor 1 (M): Chicken Tikka". */
  note: string;
  /** True when every pizza slot has a flavour selected. */
  complete: boolean;
  /** True when this product is a deal that requires flavour selection. */
  hasSlots: boolean;
};

/**
 * Renders one flavour picker per pizza included in a deal, filtered to Regular
 * Pizza flavours whose size matches the slot.
 *
 * Uses tap-to-select buttons (not a dropdown) so the product image / dialog
 * overflow can never cover the first pizza choice.
 */
export function DealFlavorSelector({
  product,
  onChange,
}: {
  product: Product;
  onChange: (state: DealFlavorState) => void;
}) {
  const dealSlots = useMemo<DealPizzaSlot[]>(
    () =>
      isDealProduct(product)
        ? parseDealPizzaSlots(product.description || "")
        : [],
    [product],
  );

  const [menuProducts, setMenuProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});

  useEffect(() => {
    setPicks({});
  }, [product]);

  useEffect(() => {
    if (!dealSlots.length) return;
    let cancelled = false;
    setLoading(true);
    getProducts()
      .then((data) => {
        if (!cancelled) setMenuProducts(data);
      })
      .catch(() => {
        if (!cancelled) setMenuProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dealSlots.length]);

  useEffect(() => {
    const note = dealSlots
      .map((slot) => {
        const flavor = menuProducts.find((p) => p.id === picks[slot.id]);
        return flavor ? `${slot.label}: ${flavor.name}` : null;
      })
      .filter(Boolean)
      .join("; ");
    const complete =
      dealSlots.length === 0 || dealSlots.every((slot) => picks[slot.id]);
    onChange({ note, complete, hasSlots: dealSlots.length > 0 });
  }, [dealSlots, picks, menuProducts, onChange]);

  if (!dealSlots.length) return null;

  return (
    <div className="relative z-20 space-y-4 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
      <Label className="block text-orange-300">
        Choose pizza flavors (size matches deal)
      </Label>
      {dealSlots.map((slot) => {
        const options = flavorsForSlot(menuProducts, slot);
        const selectedId = picks[slot.id];
        return (
          <div key={slot.id} className="space-y-2">
            <Label className="text-xs text-zinc-400">{slot.label}</Label>
            {loading ? (
              <p className="text-sm text-zinc-500">Loading flavors...</p>
            ) : options.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No {slot.size} Regular Pizza flavors available
              </p>
            ) : (
              <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {options.map((p) => {
                  const selected = selectedId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setPicks((prev) => ({ ...prev, [slot.id]: p.id }))
                      }
                      className={cn(
                        "min-h-11 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        selected
                          ? "border-orange-500 bg-orange-500/20 text-orange-200"
                          : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500",
                      )}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
