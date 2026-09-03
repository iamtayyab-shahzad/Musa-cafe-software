"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  flavorsForSlot,
  parseDealPizzaSlots,
  type DealPizzaSlot,
} from "@/lib/deal-flavors";
import { cn, formatPrice } from "@/lib/utils";
import type { Category, Product, ProductSize } from "@/types";

type Props = {
  open: boolean;
  product: Product | null;
  products: Product[];
  categories: Category[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (product: Product, size: ProductSize, flavorNote: string) => void;
};

/**
 * POS deal dialog: staff must pick a Regular Pizza flavor for each pizza
 * slot in the deal (same rules as the website).
 *
 * Keyboard: ← → move flavors · ↑ ↓ or Enter select / add
 */
export function DealFlavorDialog({
  open,
  product,
  products,
  categories,
  onOpenChange,
  onConfirm,
}: Props) {
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [activeSlot, setActiveSlot] = useState(0);
  const [kbIndex, setKbIndex] = useState(0);

  const picksRef = useRef(picks);
  const activeSlotRef = useRef(activeSlot);
  const kbIndexRef = useRef(kbIndex);
  picksRef.current = picks;
  activeSlotRef.current = activeSlot;
  kbIndexRef.current = kbIndex;

  const slots = useMemo<DealPizzaSlot[]>(
    () => (product ? parseDealPizzaSlots(product.description || "") : []),
    [product],
  );

  const menuWithCategories = useMemo(() => {
    const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
    return products.map((p) => ({
      ...p,
      category: p.category || byId[p.category_id],
    }));
  }, [products, categories]);

  const optionsBySlot = useMemo(() => {
    return slots.map((slot) => flavorsForSlot(menuWithCategories, slot));
  }, [slots, menuWithCategories]);

  const optionsBySlotRef = useRef(optionsBySlot);
  const slotsRef = useRef(slots);
  optionsBySlotRef.current = optionsBySlot;
  slotsRef.current = slots;

  useEffect(() => {
    if (!open) return;
    setPicks({});
    setActiveSlot(0);
    setKbIndex(0);
    kbIndexRef.current = 0;
    activeSlotRef.current = 0;
  }, [open, product?.id]);

  useEffect(() => {
    setKbIndex(0);
    kbIndexRef.current = 0;
  }, [activeSlot]);

  useEffect(() => {
    if (!open || !product) return;

    const buildNote = (nextPicks: Record<string, string>) =>
      slotsRef.current
        .map((slot) => {
          const flavor = menuWithCategories.find(
            (p) => p.id === nextPicks[slot.id],
          );
          return flavor ? `${slot.label}: ${flavor.name}` : null;
        })
        .filter(Boolean)
        .join("; ");

    const confirmOrder = (nextPicks: Record<string, string>) => {
      const size = product.sizes?.[0];
      const slotList = slotsRef.current;
      const complete =
        slotList.length > 0 &&
        slotList.every((slot) => Boolean(nextPicks[slot.id]));
      if (!size || !complete) return false;
      onConfirm(product, size, buildNote(nextPicks));
      onOpenChange(false);
      return true;
    };

    const selectFocused = () => {
      const slotList = slotsRef.current;
      const slotIdx = activeSlotRef.current;
      const slot = slotList[slotIdx];
      const options = optionsBySlotRef.current[slotIdx] || [];
      const focused = options[kbIndexRef.current];
      if (!slot || !focused) return;

      const nextPicks = { ...picksRef.current, [slot.id]: focused.id };
      setPicks(nextPicks);
      picksRef.current = nextPicks;

      const nextIncomplete = slotList.findIndex(
        (s, i) => i > slotIdx && !nextPicks[s.id],
      );
      if (nextIncomplete >= 0) {
        setActiveSlot(nextIncomplete);
        activeSlotRef.current = nextIncomplete;
        return;
      }

      const firstIncomplete = slotList.findIndex((s) => !nextPicks[s.id]);
      if (firstIncomplete >= 0) {
        setActiveSlot(firstIncomplete);
        activeSlotRef.current = firstIncomplete;
        return;
      }

      confirmOrder(nextPicks);
    };

    const onKey = (e: KeyboardEvent) => {
      const options =
        optionsBySlotRef.current[activeSlotRef.current] || [];

      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        if (!options.length) return;
        setKbIndex((i) => Math.min(options.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        if (!options.length) return;
        setKbIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const slotList = slotsRef.current;
        const nextPicks = picksRef.current;
        const allPicked =
          slotList.length > 0 &&
          slotList.every((slot) => Boolean(nextPicks[slot.id]));
        // If everything is already picked, Enter/↑/↓ adds the deal.
        if (allPicked && e.key === "Enter") {
          confirmOrder(nextPicks);
          return;
        }
        selectFocused();
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, product, menuWithCategories, onConfirm, onOpenChange]);

  if (!product) return null;

  const size = product.sizes?.[0];
  const complete =
    slots.length > 0 && slots.every((slot) => Boolean(picks[slot.id]));

  const note = slots
    .map((slot) => {
      const flavor = menuWithCategories.find((p) => p.id === picks[slot.id]);
      return flavor ? `${slot.label}: ${flavor.name}` : null;
    })
    .filter(Boolean)
    .join("; ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
        data-pos-dialog-open="true"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-black">
            {product.name}
          </DialogTitle>
          <p className="text-sm text-zinc-400">{product.description}</p>
        </DialogHeader>

        <p className="text-sm text-zinc-400">
          Choose pizza flavors · ← → move · ↑ ↓ or Enter select
        </p>

        <div className="relative z-20 space-y-4 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
          <Label className="block text-orange-300">
            Choose pizza flavors (size matches deal)
          </Label>
          {slots.map((slot, slotIndex) => {
            const options = optionsBySlot[slotIndex] || [];
            const selectedId = picks[slot.id];
            const isActive = slotIndex === activeSlot;
            return (
              <div
                key={slot.id}
                className={cn(
                  "space-y-2 rounded-md p-2 transition",
                  isActive && "bg-orange-500/10 ring-1 ring-orange-500/40",
                )}
              >
                <Label className="text-xs text-zinc-400">{slot.label}</Label>
                {options.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    No {slot.size}{" "}
                    {slot.tier === "special" ? "Special" : "Regular"} Pizza
                    flavors available
                  </p>
                ) : (
                  <div className="grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                    {options.map((p, optionIndex) => {
                      const selected = selectedId === p.id;
                      const focused = isActive && optionIndex === kbIndex;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseEnter={() => {
                            setActiveSlot(slotIndex);
                            setKbIndex(optionIndex);
                          }}
                          onClick={() => {
                            setActiveSlot(slotIndex);
                            setKbIndex(optionIndex);
                            setPicks((prev) => ({ ...prev, [slot.id]: p.id }));
                          }}
                          className={cn(
                            "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                            focused
                              ? "pos-kb-focus border-orange-500 bg-orange-500 text-black"
                              : selected
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

        <Button
          className="w-full"
          disabled={!complete || !size}
          onClick={() => {
            if (!size || !complete) return;
            onConfirm(product, size, note);
            onOpenChange(false);
          }}
        >
          Add to Order
          {size ? ` · ${formatPrice(size.price)}` : ""}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
