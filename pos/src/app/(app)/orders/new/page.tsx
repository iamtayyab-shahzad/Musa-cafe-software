"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, Trash2, Printer } from "lucide-react";
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
import { useBill } from "@/context/bill-context";
import { useMenuSearch } from "@/context/menu-search-context";
import { requiresDealFlavorChoice } from "@/lib/deal-flavors";
import { mediaUrl } from "@/lib/media";
import { requiresDrinkFlavor } from "@/lib/drink-flavors";
import {
  isPizzaProduct,
  isPizzaSizeLabel,
  pizzaSellableSizes,
} from "@/lib/is-pizza";
import {
  calcCodFee,
  calcGrandTotal,
  cn,
  formatPkPhone,
  formatPrice,
  isValidPkPhone,
  recomputeOrderMoney,
  LAST_RECEIPT_KEY,
  normalizePkPhone,
  ORDER_TYPES,
  paymentsForOrderType,
  WALKIN_LOCATION_ID,
} from "@/lib/utils";
import { printCustomerReceipt, printKitchenReceipt, encodeKitchenInstructions } from "@/lib/receipt";
import { activePromoInfo, weekendPromoLabel } from "@/lib/discount-rules";
import { deleteDraft } from "@/lib/offline-db";
import { ordersShareIdentity } from "@/lib/order-identity";
import { PhoneSuggest } from "@/components/phone-suggest";
import {
  categoriesApi,
  locationsApi,
  ordersApi,
  productsApi,
  settingsApi,
} from "@/services/api";
import type { Customer, Order, OrderItem, Product, ProductSize } from "@/types";

const DealFlavorDialog = dynamic(
  () =>
    import("@/components/deal-flavor-dialog").then((m) => m.DealFlavorDialog),
  { ssr: false },
);

const DrinkFlavorDialog = dynamic(
  () =>
    import("@/components/drink-flavor-dialog").then((m) => m.DrinkFlavorDialog),
  { ssr: false },
);

const ManualPriceDialog = dynamic(
  () =>
    import("@/components/manual-price-dialog").then((m) => m.ManualPriceDialog),
  { ssr: false },
);

export default function NewOrderPage() {
  const qc = useQueryClient();
  const bill = useBill();
  const { search, setSearch } = useMenuSearch();
  const [categoryId, setCategoryId] = useState("all");
  const [busy, setBusy] = useState(false);
  const [dealProduct, setDealProduct] = useState<Product | null>(null);
  const [drinkProduct, setDrinkProduct] = useState<Product | null>(null);
  const [manualPriceProduct, setManualPriceProduct] = useState<Product | null>(
    null,
  );
  const isWalkin = bill.orderType === "walkin";
  const paymentOptions = paymentsForOrderType(bill.orderType);

  useEffect(() => {
    if (bill.cartRecovered && bill.items.length) {
      toast.message("Cart restored from offline draft");
    }
    // only once when recovered with items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill.cartRecovered]);

  const {
    data: products = [],
    isLoading: productsLoading,
    isError: productsError,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ["products"],
    queryFn: productsApi.list,
    staleTime: 5 * 60_000,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: categoriesApi.list,
    staleTime: 5 * 60_000,
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: locationsApi.list,
    staleTime: 5 * 60_000,
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
    staleTime: 5 * 60_000,
  });

  // Only block the menu when we have nothing cached yet.
  const showMenuLoading = productsLoading && products.length === 0;

  const deliveryLocations = useMemo(
    () => locations.filter((l) => l.id !== WALKIN_LOCATION_ID),
    [locations],
  );

  const currency = settings?.currency || "Rs";
  const deliveryCharge = isWalkin ? 0 : bill.deliveryCharge;
  const codFee = calcCodFee(
    bill.paymentMethod,
    settings?.cash_on_delivery_fee || 0,
  );
  const grandTotal = calcGrandTotal(
    bill.subtotal,
    deliveryCharge,
    codFee,
    bill.discount,
  );

  const productsWithCategories = useMemo(() => {
    const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
    return products.map((p) => ({
      ...p,
      category: p.category || byId[p.category_id],
    }));
  }, [products, categories]);

  const filtered = useMemo(() => {
    return productsWithCategories
      .filter((p) => p.available)
      .filter((p) => (categoryId === "all" ? true : p.category_id === categoryId))
      .filter((p) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.display_order - b.display_order);
  }, [productsWithCategories, categoryId, search]);

  const onProductClick = useCallback(
    (product: Product, size?: ProductSize) => {
      const sizes = isPizzaProduct(product)
        ? pizzaSellableSizes(product.sizes)
        : product.sizes || [];
      const chosen = size || sizes[0] || product.sizes?.[0];
      if (!chosen) {
        toast.error("No sizes configured for this product");
        return;
      }
      if (requiresDealFlavorChoice(product)) {
        setDealProduct(product);
        return;
      }
      if (requiresDrinkFlavor(product)) {
        setDrinkProduct(product);
        return;
      }
      if (product.allow_manual_price) {
        setManualPriceProduct(product);
        return;
      }
      bill.addProduct(product, chosen);
      if (isPizzaProduct(product) && sizes.length > 1) {
        toast.message(`${product.name} added (${chosen.size})`);
      }
    },
    [bill.addProduct], // addProduct is stable from BillProvider
  );

  const onManualPriceConfirm = (
    product: Product,
    size: ProductSize,
    price: number,
  ) => {
    bill.addProduct(product, size, { price });
    toast.success(`${product.name} added · ${formatPrice(price, currency)}`);
  };

  const onDealConfirm = (
    product: Product,
    size: ProductSize,
    flavorNote: string,
  ) => {
    bill.addProduct(product, size, { special_instructions: flavorNote });
    toast.success(`${product.name} added with pizza flavors`);
  };

  const onDrinkConfirm = (
    product: Product,
    size: ProductSize,
    flavorNote: string,
  ) => {
    bill.addProduct(product, size, { special_instructions: flavorNote });
    toast.success(`${product.name} added (${flavorNote.replace(/^Flavor:\s*/i, "")})`);
  };

  const buildPayload = () => {
    const notes = [bill.orderNotes.trim()];
    if (isWalkin && bill.tableNumber.trim()) {
      notes.push(`TABLE:${bill.tableNumber.trim()}`);
    }
    return {
      customer_name: isWalkin ? "Walk-in Customer" : bill.customerName.trim(),
      phone: isWalkin ? "0000000000" : normalizePkPhone(bill.phone),
      address: isWalkin ? "In Store" : bill.address.trim(),
      location_id: isWalkin ? WALKIN_LOCATION_ID : bill.locationId,
      payment_method: bill.paymentMethod,
      order_notes: notes.filter(Boolean).join(" | "),
      items: bill.items.map((i) => ({
        product_id: i.product_id,
        product_size_id: i.size_id,
        quantity: i.quantity,
        price: i.price,
        special_instructions: encodeKitchenInstructions({
          crust: i.crust,
          toppings: i.toppings,
          extras: i.extras,
          notes: i.special_instructions,
        }),
      })),
    };
  };

  /** Ensure kitchen/customer receipts always show product names (never blank). */
  const enrichOrderForPrint = (order: Order): Order => {
    // Order.items is optional on the type; always build a concrete array here so
    // print enrichment cannot hit `possibly undefined` on .map().
    const fallbackItems: OrderItem[] = bill.items.map((b, i) => ({
      id: `${order.id}-line-${i}`,
      created_at: order.created_at || new Date().toISOString(),
      updated_at: order.updated_at || new Date().toISOString(),
      order_id: order.id,
      product_id: b.product_id,
      product_size_id: b.size_id,
      quantity: b.quantity,
      price: b.price,
      special_instructions: encodeKitchenInstructions({
        crust: b.crust,
        toppings: b.toppings,
        extras: b.extras,
        notes: b.special_instructions,
      }),
      product: {
        id: b.product_id,
        created_at: "",
        updated_at: "",
        category_id: "",
        name: b.product_name || "Item",
        description: "",
        image: b.product_image || "",
        featured: false,
        available: true,
        display_order: 0,
      },
      product_size: {
        id: b.size_id,
        created_at: "",
        updated_at: "",
        product_id: b.product_id,
        size: b.size || "-",
        price: b.price,
      },
      // Flat fields survive JSON round-trips / IndexedDB even if nested product is dropped.
      product_name: b.product_name || "Item",
      size: b.size || "-",
    }));

    // Always prefer bill lines for print — server/local rows often omit nested product.
    const orderItems = order.items ?? [];
    const source: OrderItem[] =
      bill.items.length > 0 || orderItems.length === 0
        ? fallbackItems
        : orderItems;

    return {
      ...order,
      items: source.map((item, idx) => {
        const billLine = bill.items[idx];
        const match =
          billLine &&
          billLine.product_id === item.product_id &&
          billLine.size_id === item.product_size_id
            ? billLine
            : bill.items.find(
                (b) =>
                  b.product_id === item.product_id &&
                  b.size_id === item.product_size_id,
              ) || billLine;
        const name =
          match?.product_name?.trim() ||
          item.product?.name?.trim() ||
          (item as { product_name?: string }).product_name?.trim() ||
          "Item";
        const size =
          match?.size?.trim() ||
          item.product_size?.size?.trim() ||
          (item as { size?: string }).size?.trim() ||
          "-";
        return {
          ...item,
          product: {
            id: item.product_id,
            created_at: item.product?.created_at || "",
            updated_at: item.product?.updated_at || "",
            category_id: item.product?.category_id || "",
            name,
            description: item.product?.description || "",
            image: match?.product_image || item.product?.image || "",
            featured: false,
            available: true,
            display_order: 0,
          },
          product_size: {
            id: item.product_size_id,
            created_at: "",
            updated_at: "",
            product_id: item.product_id,
            size,
            price: item.price,
          },
          product_name: name,
          size,
          special_instructions:
            item.special_instructions ||
            encodeKitchenInstructions({
              crust: match?.crust,
              toppings: match?.toppings,
              extras: match?.extras,
              notes: match?.special_instructions,
            }),
        };
      }) as Order["items"],
    };
  };

  const validate = () => {
    if (!bill.items.length) {
      toast.error("Cart is empty");
      return false;
    }
    if (!paymentOptions.some((p) => p.id === bill.paymentMethod)) {
      toast.error("Select a valid payment method");
      return false;
    }
    if (isWalkin) return true;
    if (!bill.customerName.trim() || !bill.phone.trim()) {
      toast.error("Customer name and phone required");
      return false;
    }
    if (!isValidPkPhone(bill.phone)) {
      toast.error("Enter a valid 11-digit mobile number (e.g. 0300-1234567)");
      return false;
    }
    if (!bill.locationId || bill.locationId === WALKIN_LOCATION_ID) {
      toast.error("Select delivery location");
      return false;
    }
    if (!bill.address.trim()) {
      toast.error("Delivery address required");
      return false;
    }
    return true;
  };

  const placeOrder = (status: "COMPLETED" | "PENDING") => {
    if (!validate() || busy) return;

    setBusy(true);

    // Snapshot everything needed BEFORE clearing the cart so UI can finish instantly.
    const payload = buildPayload();
    const editingOrderId = bill.editingOrderId;
    const draftId = bill.draftId;
    const orderType = bill.orderType;
    const clientId = editingOrderId || crypto.randomUUID();
    const now = new Date().toISOString();
    const delivery = isWalkin ? 0 : bill.deliveryCharge;
    const codFee = calcCodFee(
      bill.paymentMethod,
      settings?.cash_on_delivery_fee || 0,
    );

    const cached = editingOrderId
      ? qc
          .getQueryData<Order[]>(["orders", "pending"])
          ?.find((o) => o.id === editingOrderId) ||
        qc
          .getQueryData<Order[]>(["orders"])
          ?.find((o) => o.id === editingOrderId)
      : undefined;

    const order: Order = {
      ...(cached || ({} as Order)),
      id: clientId,
      client_order_id: clientId,
      order_number:
        cached?.order_number ||
        `LOCAL-${clientId.slice(0, 8).toUpperCase()}`,
      order_type: orderType,
      order_status: status,
      customer_name: payload.customer_name,
      phone: payload.phone,
      address: payload.address,
      location_id: payload.location_id,
      payment_method: payload.payment_method,
      order_notes: payload.order_notes,
      subtotal: bill.subtotal,
      discount: bill.discount,
      delivery_charge: delivery,
      cash_on_delivery_fee: cached?.cash_on_delivery_fee ?? codFee,
      grand_total: calcGrandTotal(
        bill.subtotal,
        delivery,
        cached?.cash_on_delivery_fee ?? codFee,
        bill.discount,
      ),
      created_at: cached?.created_at || now,
      updated_at: now,
      items: [],
      sync_status: "pending_sync",
    };

    // Enrich from current bill lines before clearBill() wipes them.
    // Recompute money from lines so print never uses a stale cached total.
    const printable = recomputeOrderMoney(enrichOrderForPrint(order));
    localStorage.setItem(LAST_RECEIPT_KEY, JSON.stringify(printable));

    if (status === "PENDING") {
      qc.setQueryData<Order[]>(["orders", "pending"], (old) => {
        const list = old || [];
        const without = list.filter((o) => !ordersShareIdentity(o, printable));
        return [printable, ...without];
      });
    } else {
      qc.setQueryData<Order[]>(["orders", "pending"], (old) =>
        (old || []).filter((o) => !ordersShareIdentity(o, printable)),
      );
    }

    if (draftId) void deleteDraft(draftId);
    bill.clearBill();
    // Persist locally before printing so a crash cannot leave a printed ticket
    // with nothing in IndexedDB / sync queue.
    void (async () => {
      try {
        if (editingOrderId) {
          await ordersApi.update(editingOrderId, {
            customer_name: payload.customer_name,
            phone: payload.phone,
            address: payload.address,
            location_id: payload.location_id,
            payment_method: payload.payment_method,
            order_notes: payload.order_notes,
            items: payload.items,
            subtotal: printable.subtotal,
            discount: printable.discount,
            delivery_charge: printable.delivery_charge,
            cash_on_delivery_fee: printable.cash_on_delivery_fee,
            grand_total: printable.grand_total,
          });
          if (status === "COMPLETED") {
            await ordersApi.complete(editingOrderId);
          }
        } else {
          const created = await ordersApi.create(
            { ...payload, client_order_id: clientId },
            orderType,
          );
          if (status === "COMPLETED") {
            await ordersApi.complete(created.id);
          }
        }

        if (status === "COMPLETED") {
          void printCustomerReceipt(printable, settings || null).then(
            (printed) => {
              toast.success(
                !printed
                  ? "Order completed — allow popups to print customer receipt"
                  : editingOrderId
                    ? "Order updated & completed"
                    : "Order completed & customer receipt printed",
              );
            },
          );
        } else {
          void printKitchenReceipt(printable).then((printed) => {
            toast.success(
              !printed
                ? "Saved to Pending — allow popups to print kitchen receipt"
                : editingOrderId
                  ? "Pending updated — kitchen receipt printed"
                  : "Saved to Pending — kitchen receipt printed",
            );
          });
        }

        void Promise.all([
          qc.invalidateQueries({ queryKey: ["orders"], exact: true }),
          qc.invalidateQueries({ queryKey: ["orders", "pending"] }),
        ]);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? `Save queued failed: ${err.message}`
            : "Failed to save order in background",
        );
        void Promise.all([
          qc.invalidateQueries({ queryKey: ["orders"], exact: true }),
          qc.invalidateQueries({ queryKey: ["orders", "pending"] }),
        ]);
      } finally {
        setBusy(false);
      }
    })();
  };

  const cancelBill = () => {
    bill.clearBill();
    toast.message("Bill cleared");
  };

  const reprint = () => {
    try {
      const raw = localStorage.getItem(LAST_RECEIPT_KEY);
      if (!raw) {
        toast.error("No receipt to reprint");
        return;
      }
      void printCustomerReceipt(
        JSON.parse(raw) as Order,
        settings || null,
        true,
      ).then((printed) => {
        if (!printed) {
          toast.error("Allow popups to reprint receipt");
        } else {
          toast.success("Receipt reprinted");
        }
      });
    } catch {
      toast.error("Reprint failed");
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[1fr_380px]">
      <div className="flex min-h-0 flex-col overflow-hidden lg:border-r lg:border-zinc-800">
        {showMenuLoading ? (
          <div className="flex flex-1 items-center justify-center p-8 text-zinc-400">
            Loading menu…
          </div>
        ) : null}
        {productsError ? (
          <div className="m-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            Could not load products.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void refetchProducts()}
            >
              Retry
            </button>
          </div>
        ) : null}
        {!productsLoading && !productsError && products.length === 0 ? (
          <div className="m-3 rounded-lg border border-orange-500/40 bg-orange-500/10 p-4 text-sm text-orange-200">
            No products cached. Connect to the internet once to sync the menu.
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 border-b border-zinc-800 p-3">
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryId("all");
            }}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-bold",
              categoryId === "all"
                ? "bg-orange-500 text-black"
                : "bg-zinc-900 text-zinc-300",
            )}
          >
            All
          </button>
          {categories
            .filter((c) => c.visible)
            .sort((a, b) => a.display_order - b.display_order)
            .map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategoryId(c.id);
                }}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-bold",
                  categoryId === c.id
                    ? "bg-orange-500 text-black"
                    : "bg-zinc-900 text-zinc-300",
                )}
              >
                {c.name}
              </button>
            ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {filtered.map((product) => (
              <MemoProductTile
                key={product.id}
                product={product}
                currency={currency}
                onAdd={onProductClick}
              />
            ))}
          </div>
          {!filtered.length && (
            <p className="p-8 text-center text-zinc-500">No products found</p>
          )}
        </div>
      </div>

      <aside className="flex max-h-[50vh] min-h-0 flex-col border-t border-zinc-800 bg-zinc-950 lg:max-h-none lg:border-t-0">
        <div className="border-b border-zinc-800 p-4">
          <h2 className="text-xl font-black text-white">
            {bill.editingOrderId ? "Editing Pending Order" : "Current Bill"}
          </h2>
          {bill.editingOrderId ? (
            <p className="mt-1 text-xs text-amber-300">
              Changes will update the existing pending order.
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            {ORDER_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={Boolean(bill.editingOrderId)}
                onClick={() => bill.setOrderType(t.id)}
                className={cn(
                  "flex-1 rounded-lg px-2 py-2 text-xs font-bold",
                  bill.orderType === t.id
                    ? "bg-orange-500 text-black"
                    : "bg-zinc-900 text-zinc-400",
                  bill.editingOrderId && "opacity-60",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {!isWalkin && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Customer Name</Label>
                  <Input
                    value={bill.customerName}
                    onChange={(e) => bill.setCustomerName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <PhoneSuggest
                    value={bill.phone}
                    onChange={(v) => bill.setPhone(v)}
                    onSelectCustomer={(c: Customer) => {
                      bill.setPhone(formatPkPhone(c.phone));
                      if (c.name) bill.setCustomerName(c.name);
                      if (c.address) bill.setAddress(c.address);
                      if (c.last_location_id) {
                        const loc = deliveryLocations.find(
                          (l) => l.id === c.last_location_id,
                        );
                        if (loc) {
                          bill.setLocation(loc.id, loc.delivery_charge || 0);
                        }
                      }
                      toast.success("Customer loaded");
                    }}
                  />
                  {bill.phone.trim() && !isValidPkPhone(bill.phone) ? (
                    <p className="text-xs text-red-400">
                      Enter an 11-digit number starting with 03
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Address</Label>
                <Input
                  value={bill.address}
                  onChange={(e) => bill.setAddress(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Delivery Location</Label>
                <Select
                  value={bill.locationId || undefined}
                  onValueChange={(id) => {
                    const loc = deliveryLocations.find((l) => l.id === id);
                    bill.setLocation(id, loc?.delivery_charge || 0);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {deliveryLocations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} · {formatPrice(l.delivery_charge, currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {isWalkin ? (
            <div className="space-y-1">
              <Label>Table Number (optional)</Label>
              <Input
                value={bill.tableNumber}
                placeholder="e.g. 5"
                onChange={(e) => bill.setTableNumber(e.target.value)}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            {bill.items.map((item) => {
              const product = products.find((p) => p.id === item.product_id);
              return (
                <div
                  key={item.key}
                  className="rounded-lg border border-zinc-800 bg-black/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-white">{item.product_name}</p>
                      {item.allow_manual_price ? (
                        <div className="mt-1 flex items-center gap-2">
                          <Label className="text-xs text-zinc-400">Price</Label>
                          <Input
                            className="h-8 w-24 text-sm"
                            inputMode="numeric"
                            value={String(item.price)}
                            onChange={(e) => {
                              const next = Number(
                                e.target.value.replace(/[^\d]/g, ""),
                              );
                              if (Number.isFinite(next) && next > 0) {
                                bill.setLinePrice(item.key, next);
                              }
                            }}
                          />
                          {isPizzaSizeLabel(item.size) ? (
                            <span className="text-xs text-zinc-500">
                              · {item.size}
                            </span>
                          ) : item.size && item.size !== "Regular" ? (
                            <span className="text-xs text-zinc-500">
                              · {item.size}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-sm text-orange-400">
                          {formatPrice(item.price, currency)}
                          {isPizzaSizeLabel(item.size) ? ` · ${item.size}` : ""}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => bill.remove(item.key)}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {product &&
                    isPizzaProduct(product) &&
                    pizzaSellableSizes(product.sizes).length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {pizzaSellableSizes(product.sizes).map((s: ProductSize) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => bill.changeSize(item.key, s)}
                          className={cn(
                            "rounded px-2 py-1 text-xs font-bold",
                            item.size_id === s.id
                              ? "bg-orange-500 text-black"
                              : "bg-zinc-800 text-zinc-400",
                          )}
                        >
                          {s.size}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-9 w-9"
                      onClick={() => bill.decrease(item.key)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center text-lg font-bold">
                      {item.quantity}
                    </span>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-9 w-9"
                      onClick={() => bill.increase(item.key)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <span className="ml-auto font-bold text-white">
                      {formatPrice(item.price * item.quantity, currency)}
                    </span>
                  </div>
                </div>
              );
            })}
            {!bill.items.length && (
              <p className="text-center text-sm text-zinc-500">
                Tap products to add
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Order Notes</Label>
            <Textarea
              value={bill.orderNotes}
              onChange={(e) => bill.setOrderNotes(e.target.value)}
            />
          </div>

          <div>
            <Label className="mb-2 block">Payment</Label>
            <div className="grid grid-cols-2 gap-2">
              {paymentOptions.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => bill.setPaymentMethod(m.id)}
                  className={cn(
                    "rounded-lg px-2 py-3 text-sm font-bold",
                    bill.paymentMethod === m.id
                      ? "bg-orange-500 text-black"
                      : "bg-zinc-900 text-zinc-400",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1 rounded-lg border border-zinc-800 p-3 text-sm">
            {(() => {
              const promo = activePromoInfo(bill.items);
              if (!promo) return null;
              const minLabel = promo.min_subtotal.toLocaleString("en-PK");
              return (
                <p className="mb-2 rounded-md bg-emerald-500/10 px-2 py-1.5 text-xs font-semibold text-emerald-400">
                  {promo.name}
                  {bill.discount <= 0
                    ? ` — add Rs ${minLabel}+ of non-deal items to apply`
                    : null}
                </p>
              );
            })()}
            <div className="flex justify-between text-zinc-400">
              <span>Subtotal</span>
              <span>{formatPrice(bill.subtotal, currency)}</span>
            </div>
            {bill.discount > 0 ? (
              <div className="flex justify-between text-emerald-400">
                <span>
                  {weekendPromoLabel(bill.items) ||
                    activePromoInfo(bill.items)?.name ||
                    "Promo discount"}
                </span>
                <span>-{formatPrice(bill.discount, currency)}</span>
              </div>
            ) : null}
            {!isWalkin && (
              <div className="flex justify-between text-zinc-400">
                <span>Delivery</span>
                <span>{formatPrice(deliveryCharge, currency)}</span>
              </div>
            )}
            {codFee > 0 && (
              <div className="flex justify-between text-zinc-400">
                <span>COD Fee</span>
                <span>{formatPrice(codFee, currency)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-zinc-800 pt-2 text-lg font-black text-white">
              <span>Grand Total</span>
              <span className="text-orange-400">
                {formatPrice(grandTotal, currency)}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-zinc-800 p-3">
          <Button
            variant="secondary"
            onClick={() => placeOrder("PENDING")}
            disabled={busy}
          >
            {bill.editingOrderId ? "Update Pending" : "Save Pending"}
          </Button>
          <Button variant="outline" onClick={reprint}>
            <Printer className="h-4 w-4" /> Reprint
          </Button>
          <Button variant="danger" onClick={cancelBill} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="success"
            onClick={() => placeOrder("COMPLETED")}
            disabled={busy}
          >
            Complete
          </Button>
        </div>
      </aside>

      <DealFlavorDialog
        open={Boolean(dealProduct)}
        product={dealProduct}
        products={productsWithCategories}
        categories={categories}
        onOpenChange={(open) => {
          if (!open) setDealProduct(null);
        }}
        onConfirm={onDealConfirm}
      />
      <DrinkFlavorDialog
        open={Boolean(drinkProduct)}
        product={drinkProduct}
        flavorsRaw={settings?.drink_flavors}
        onOpenChange={(open) => {
          if (!open) setDrinkProduct(null);
        }}
        onConfirm={onDrinkConfirm}
      />
      <ManualPriceDialog
        open={Boolean(manualPriceProduct)}
        product={manualPriceProduct}
        onOpenChange={(open) => {
          if (!open) setManualPriceProduct(null);
        }}
        onConfirm={onManualPriceConfirm}
      />
    </div>
  );
}

function ProductTile({
  product,
  currency,
  onAdd,
}: {
  product: Product;
  currency: string;
  onAdd: (p: Product, size?: ProductSize) => void;
}) {
  const sizes = isPizzaProduct(product)
    ? pizzaSellableSizes(product.sizes)
    : product.sizes || [];
  const prices = sizes.map((s) => s.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const multiSize = isPizzaProduct(product) && sizes.length > 1;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-left transition hover:border-orange-500">
      <button
        type="button"
        onClick={() => {
          if (!multiSize) onAdd(product, sizes[0]);
        }}
        className={cn(
          "w-full text-left",
          multiSize ? "cursor-default" : "cursor-pointer",
        )}
      >
        <div className="relative aspect-[4/3] bg-zinc-900">
          {product.image ? (
            <Image
              src={mediaUrl(product.image, { width: 400 })}
              alt={product.name}
              fill
              unoptimized
              className="object-cover"
              sizes="200px"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-600">
              No image
            </div>
          )}
        </div>
        <div className="px-3 pt-3">
          <p className="line-clamp-1 text-base font-bold text-white">
            {product.name}
          </p>
          {multiSize ? (
            <p className="mt-1 text-sm font-semibold text-orange-400">
              {formatPrice(minPrice, currency)}
              {maxPrice !== minPrice
                ? ` – ${formatPrice(maxPrice, currency)}`
                : ""}
            </p>
          ) : (
            <p className="mt-1 pb-3 text-sm font-semibold text-orange-400">
              {formatPrice(minPrice, currency)}
            </p>
          )}
        </div>
      </button>
      {multiSize ? (
        <div className="relative z-10 grid grid-cols-2 gap-1.5 p-3 pt-2">
          {sizes.map((s) => (
            <button
              key={s.id || s.size}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAdd(product, s);
              }}
              className="min-h-11 rounded-md bg-zinc-900 px-1.5 py-2 text-center ring-1 ring-zinc-800 transition hover:bg-zinc-800 hover:ring-orange-500 active:bg-orange-500 active:text-black"
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                {s.size}
              </p>
              <p className="text-xs font-semibold text-zinc-100">
                {formatPrice(s.price, currency)}
              </p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const MemoProductTile = memo(ProductTile);
