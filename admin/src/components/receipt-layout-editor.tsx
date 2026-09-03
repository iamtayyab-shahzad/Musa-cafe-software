"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  RECEIPT_BLOCK_LABELS,
  addableBlockTypes,
  defaultReceiptLayout,
  layoutsEqual,
  makeBlock,
  parseReceiptLayout,
  serializeReceiptLayout,
  type ReceiptBlock,
  type ReceiptKind,
  type ReceiptLayout,
} from "@/lib/receipt-layout";

function previewLine(block: ReceiptBlock, shopName: string, phone: string): string {
  if (!block.visible) return "";
  const sample: Record<string, string> = {
    shop_name: shopName || "MUSA CAFE",
    order_number: "Order #12",
    table_service: "TABLE 3, Dine In",
    table: "TABLE 3",
    banner: block.text?.trim() || "* Kitchen Order Ticket *",
    datetime: "Bill Date : 03/09/2026 9:03:50 pm",
    phone: phone || "03095997786",
    phone_datetime: `${phone || "03095997786"} · 03/09/2026 · 9:03:50 pm`,
    customer: "Customer: Walk-in",
    payment: "Payment: CASH",
    items: "Mayo Fries Large     1    300",
    totals: "TOTAL  Rs 610",
    item_count: "Items : 3     Qty : 3",
    notes: "Notes: —",
    thank_you: block.text?.trim() || "Thank you!",
    website_qr: "Website QR",
    staff_notes: "Staff notes:",
    custom_text: block.text?.trim() || "(custom text)",
  };
  return sample[block.type] || "";
}

function Preview({
  kind,
  layout,
  shopName,
  phone,
}: {
  kind: ReceiptKind;
  layout: ReceiptLayout;
  shopName: string;
  phone: string;
}) {
  const blocks = layout[kind];
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {kind} preview (80mm)
      </p>
      <div className="mx-auto w-[248px] bg-white px-2 py-2 text-black">
        {blocks.map((block) => {
          const text = previewLine(block, shopName, phone);
          if (!text) return null;
          return (
            <div
              key={block.id}
              style={{
                textAlign: block.align,
                fontSize: block.fontSize,
                fontWeight: block.fontWeight,
                lineHeight: 1.25,
                marginBottom: 4,
              }}
            >
              {text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReceiptLayoutEditor({
  value,
  shopName,
  phone,
  onChange,
}: {
  value: string;
  shopName: string;
  phone: string;
  onChange: (json: string) => void;
}) {
  const layout = useMemo(() => parseReceiptLayout(value), [value]);
  const [kind, setKind] = useState<ReceiptKind>("customer");
  const isDefault = layoutsEqual(layout, defaultReceiptLayout());
  const blocks = layout[kind];
  const addable = addableBlockTypes(kind, blocks);

  const commit = (next: ReceiptLayout) => {
    onChange(serializeReceiptLayout(next));
  };

  const updateBlock = (id: string, patch: Partial<ReceiptBlock>) => {
    commit({
      ...layout,
      [kind]: blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...blocks];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    commit({ ...layout, [kind]: next });
  };

  return (
    <div className="space-y-4 border-t border-zinc-800 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Label>Receipt print layout</Label>
          <p className="mt-1 text-sm text-zinc-500">
            Reorder blocks, change size and alignment. Kitchen and customer
            tickets are separate. Default is the layout that already prints
            well.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isDefault}
          onClick={() => commit(defaultReceiptLayout())}
        >
          Default (current print)
        </Button>
      </div>

      <div className="flex gap-2">
        {(["customer", "kitchen"] as ReceiptKind[]).map((tab) => (
          <Button
            key={tab}
            type="button"
            size="sm"
            variant={kind === tab ? "default" : "secondary"}
            onClick={() => setKind(tab)}
          >
            {tab === "customer" ? "Customer receipt" : "Kitchen ticket"}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-2">
          {blocks.map((block, index) => (
            <div
              key={block.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label="Move up"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={index === blocks.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </Button>
                </div>
                <span className="min-w-[9rem] flex-1 text-sm font-semibold">
                  {RECEIPT_BLOCK_LABELS[block.type]}
                </span>
                <Switch
                  checked={block.visible}
                  onCheckedChange={(on) => updateBlock(block.id, { visible: on })}
                  aria-label={`Show ${RECEIPT_BLOCK_LABELS[block.type]}`}
                />
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="text-xs text-zinc-500">
                  Size
                  <Input
                    type="number"
                    min={8}
                    max={28}
                    className="mt-1 h-10"
                    value={block.fontSize}
                    onChange={(e) =>
                      updateBlock(block.id, {
                        fontSize: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="text-xs text-zinc-500">
                  Weight
                  <select
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-sm text-white"
                    value={block.fontWeight}
                    onChange={(e) =>
                      updateBlock(block.id, {
                        fontWeight: Number(e.target.value) as 400 | 600 | 700,
                      })
                    }
                  >
                    <option value={400}>Regular</option>
                    <option value={600}>Semi-bold</option>
                    <option value={700}>Bold</option>
                  </select>
                </label>
                <label className="text-xs text-zinc-500">
                  Align
                  <select
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-sm text-white"
                    value={block.align}
                    onChange={(e) =>
                      updateBlock(block.id, {
                        align: e.target.value as ReceiptBlock["align"],
                      })
                    }
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
              </div>
              {block.type === "custom_text" ||
              block.type === "banner" ||
              block.type === "thank_you" ? (
                <Input
                  className="mt-2 h-10"
                  placeholder="Text on the receipt"
                  value={block.text || ""}
                  onChange={(e) =>
                    updateBlock(block.id, { text: e.target.value })
                  }
                />
              ) : null}
            </div>
          ))}
          {addable.length ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-zinc-500">Add block</span>
              {addable.slice(0, 8).map((type) => (
                <Button
                  key={type}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    commit({
                      ...layout,
                      [kind]: [...blocks, makeBlock(kind, type)],
                    })
                  }
                >
                  {RECEIPT_BLOCK_LABELS[type]}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        <Preview
          kind={kind}
          layout={layout}
          shopName={shopName}
          phone={phone}
        />
      </div>
    </div>
  );
}
