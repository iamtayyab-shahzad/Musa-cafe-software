"use client";

import Image from "next/image";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, Trash2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  printCustomerReceipt,
  printKitchenReceipt,
  printOneClickReceipts,
  encodeKitchenInstructions,
  encodeWalkinOrderNotes,
} from "@/lib/receipt";
import {
  allocateNextDailyNumber,
  hydrateDailyNumberFromServer,
  uniqueOrderCode,
} from "@/lib/daily-order-number";
import { karachiYmd } from "@/lib/local-sales";
import { shop } from "@/lib/shop";
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
import {
  countGridColumns,
  createHoverSelectGate,
  isDialogOpen,
  isTextEntryTarget,
  moveGridIndex,
  scrollChildIntoScroller,
} from "@/lib/pos-keyboard";
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

const PizzaSizeDialog = dynamic(
  () =>
    import("@/components/pizza-size-dialog").then((m) => m.PizzaSizeDialog),
  { ssr: false },
);

const CancelOrderPasswordDialog = dynamic(
  () =>
    import("@/components/cancel-order-password-dialog").then(
      (m) => m.CancelOrderPasswordDialog,
    ),
  { ssr: false },
);

export default function NewOrderPage() {
  const qc = useQueryClient();
  const bill = useBill();
  const { search, setSearch, focusSearch } = useMenuSearch();
  const [categoryId, setCategoryId] = useState("all");
  const [busy, setBusy] = useState(false);
  const [dealProduct, setDealProduct] = useState<Product | null>(null);
  const [drinkProduct, setDrinkProduct] = useState<Product | null>(null);
  const [cancelPasswordOpen, setCancelPasswordOpen] = useState(false);
  const [manualPriceProduct, setManualPriceProduct] = useState<Product | null>(
    null,
  );
  const [pizzaSizeProduct, setPizzaSizeProduct] = useState<Product | null>(
    null,
  );
  /** Keyboard highlight index in the visible product grid (−1 = none). */
  const [kbIndex, setKbIndex] = useState(0);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const menuScrollRef = useRef<HTMLDivElement | null>(null);
  const tableInputRef = useRef<HTMLInputElement | null>(null);
  const billScrollRef = useRef<HTMLDivElement | null>(null);
  const lastBillItemRef = useRef<HTMLDivElement | null>(null);
  const kbIndexRef = useRef(0);
  const hoverGateRef = useRef(createHoverSelectGate());
  const placeOrderRef = useRef<(status: "COMPLETED" | "PENDING") => void>(
    () => {},
  );
  /** Last click was on the Current Bill panel — Enter prints instead of adding a product. */
  const billPanelActiveRef = useRef(false);
  const isWalkin = bill.orderType === "walkin";
  const paymentOptions = paymentsForOrderType(bill.orderType);

  useEffect(() => {
    kbIndexRef.current = kbIndex;
  }, [kbIndex]);

  useEffect(() => {
    focusSearch();
  }, [focusSearch]);

  useEffect(() => {
    void hydrateDailyNumberFromServer(karachiYmd()).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (bill.cartRecovered && bill.items.length) {
      toast.message("Cart restored from offline draft");
    }
    // only once when recovered with items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill.cartRecovered]);

  const lastItemKey = bill.items[bill.items.length - 1]?.key;
  useEffect(() => {
    if (!lastItemKey) return;
    const scroller = billScrollRef.current;
    const last = lastBillItemRef.current;
    if (!scroller) return;
    requestAnimationFrame(() => {
      if (last) {
        last.scrollIntoView({ block: "end", behavior: "smooth" });
      } else {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });
  }, [lastItemKey, bill.items.length]);

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

  // Reset highlight to first visible product when search/category changes.
  useEffect(() => {
    setKbIndex(filtered.length ? 0 : -1);
  }, [search, categoryId, filtered.length]);

  const onProductClick = useCallback(
    (product: Product, size?: ProductSize) => {
      const sizes = isPizzaProduct(product)
        ? pizzaSellableSizes(product.sizes)
        : product.sizes || [];
      const multiSize = isPizzaProduct(product) && sizes.length > 1;
      if (multiSize && !size) {
        setPizzaSizeProduct(product);
        return;
      }
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

  const onPizzaSizeConfirm = useCallback(
    (product: Product, size: ProductSize) => {
      onProductClick(product, size);
    },
    [onProductClick],
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
    const order_notes = isWalkin
      ? encodeWalkinOrderNotes({
          tableNumber: bill.tableNumber,
          serviceMode: bill.serviceMode,
        })
      : "";
    return {
      customer_name: isWalkin ? "Walk-in Customer" : bill.customerName.trim(),
      phone: isWalkin ? "0000000000" : normalizePkPhone(bill.phone),
      address: isWalkin ? "In Store" : bill.address.trim(),
      location_id: isWalkin ? WALKIN_LOCATION_ID : bill.locationId,
      payment_method: isWalkin ? "cash" : bill.paymentMethod,
      order_notes,
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
    if (
      !isWalkin &&
      !paymentOptions.some((p) => p.id === bill.paymentMethod)
    ) {
      toast.error("Select a valid payment method");
      return false;
    }
    if (isWalkin) {
      if (bill.serviceMode === "dine_in" && !bill.tableNumber.trim()) {
        toast.error("Enter table number");
        tableInputRef.current?.focus();
        return false;
      }
      return true;
    }
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

    void (async () => {
      try {
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

        let businessDate = (cached?.business_date || "").trim();
        let dailyNumber = Number(cached?.daily_number) || 0;
        if (!editingOrderId && (!(dailyNumber > 0) || !businessDate)) {
          const allocated = await allocateNextDailyNumber(new Date());
          businessDate = allocated.businessDate;
          dailyNumber = allocated.dailyNumber;
        } else if (editingOrderId && !(dailyNumber > 0)) {
          // Legacy ticket without a daily token — keep blank, do not burn a new #.
          businessDate = businessDate || "";
          dailyNumber = 0;
        }
        const orderNumber =
          cached?.order_number &&
          (dailyNumber === 0 || dailyNumber === cached.daily_number)
            ? cached.order_number
            : dailyNumber > 0
              ? uniqueOrderCode(
                  shop.orderPrefix || "MC",
                  businessDate,
                  dailyNumber,
                )
              : cached?.order_number ||
                `LOCAL-${clientId.slice(0, 8).toUpperCase()}`;

        const oneClick =
          status === "PENDING" && Boolean(settings?.pos_one_click_complete);
        const editingCompleted =
          Boolean(editingOrderId) && cached?.order_status === "COMPLETED";
        let effectiveStatus: "COMPLETED" | "PENDING" = oneClick
          ? "COMPLETED"
          : status;
        if (editingCompleted) effectiveStatus = "COMPLETED";

        const order: Order = {
          ...(cached || ({} as Order)),
          id: clientId,
          client_order_id: clientId,
          order_number: orderNumber,
          business_date: businessDate,
          daily_number: dailyNumber,
          order_type: orderType,
          order_status: effectiveStatus,
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

        const printable = recomputeOrderMoney(enrichOrderForPrint(order));
        localStorage.setItem(LAST_RECEIPT_KEY, JSON.stringify(printable));

        if (effectiveStatus === "PENDING") {
          qc.setQueryData<Order[]>(["orders", "pending"], (old) => {
            const list = old || [];
            const without = list.filter(
              (o) => !ordersShareIdentity(o, printable),
            );
            return [printable, ...without];
          });
        } else {
          qc.setQueryData<Order[]>(["orders", "pending"], (old) =>
            (old || []).filter((o) => !ordersShareIdentity(o, printable)),
          );
        }

        if (draftId) void deleteDraft(draftId);
        bill.clearBill();
        focusSearch();

        // Print immediately — never wait on sync / second Enter.
        const printPromise =
          oneClick || (editingCompleted && status === "PENDING")
            ? printOneClickReceipts(printable, settings || null)
            : effectiveStatus === "COMPLETED"
              ? printCustomerReceipt(printable, settings || null)
              : printKitchenReceipt(printable, settings || null);

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
          if (effectiveStatus === "COMPLETED") {
            try {
              await ordersApi.complete(editingOrderId);
            } catch {
              /* already completed is fine */
            }
          }
        } else {
          const created = await ordersApi.create(
            {
              ...payload,
              client_order_id: clientId,
              created_at: printable.created_at,
              daily_number: dailyNumber,
              business_date: businessDate,
            },
            orderType,
          );
          if (effectiveStatus === "COMPLETED") {
            await ordersApi.complete(created.id);
          }
        }

        // Unlock UI while the printer finishes spooling.
        setBusy(false);

        const printed = await printPromise;
        if (oneClick || (editingCompleted && status === "PENDING")) {
          toast.success(
            printed
              ? "Order completed — kitchen & customer receipts printed"
              : "Order saved — allow popups if a receipt did not print",
          );
        } else if (effectiveStatus === "COMPLETED") {
          toast.success(
            !printed
              ? "Order completed — allow popups to print customer receipt"
              : editingOrderId
                ? "Order updated & completed"
                : "Order completed & customer receipt printed",
          );
        } else {
          toast.success(
            !printed
              ? "Saved to Pending — allow popups to print kitchen receipt"
              : editingOrderId
                ? "Pending updated — kitchen receipt printed"
                : "Saved to Pending — kitchen receipt printed",
          );
        }

        void Promise.all([
          qc.invalidateQueries({ queryKey: ["orders"], exact: true }),
          qc.invalidateQueries({ queryKey: ["orders", "pending"] }),
        ]);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? `Save failed: ${err.message}`
            : "Failed to save order",
        );
        void Promise.all([
          qc.invalidateQueries({ queryKey: ["orders"], exact: true }),
          qc.invalidateQueries({ queryKey: ["orders", "pending"] }),
        ]);
        setBusy(false);
      }
    })();
  };

  const cancelBill = () => {
    bill.clearBill();
    toast.message("Bill cleared");
  };

  placeOrderRef.current = placeOrder;

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

  const addHighlightedProduct = useCallback(() => {
    const idx = kbIndexRef.current;
    if (idx < 0 || idx >= filtered.length) {
      toast.message("No product selected — use ↑↓ while searching");
      return;
    }
    onProductClick(filtered[idx]);
  }, [filtered, onProductClick]);

  const markKbNav = useCallback(() => {
    hoverGateRef.current.markKeyboard();
  }, []);

  const selectProductIndex = useCallback((index: number) => {
    if (!hoverGateRef.current.allowHover()) return;
    setKbIndex(index);
  }, []);

  const onMenuPointerMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      hoverGateRef.current.onPointerMove(e.clientX, e.clientY);
    },
    [],
  );

  const focusTableOrSavePending = useCallback(() => {
    if (busy) return;
    if (!bill.items.length) {
      toast.error("Cart is empty");
      return;
    }
    if (isWalkin && bill.serviceMode === "dine_in") {
      if (!bill.tableNumber.trim()) {
        tableInputRef.current?.focus();
        tableInputRef.current?.select();
        toast.message("Type table number, then Enter to save");
        return;
      }
    }
    placeOrderRef.current("PENDING");
  }, [busy, bill.items.length, bill.serviceMode, bill.tableNumber, isWalkin]);

  // Scroll highlighted tile into view (manual — avoids hover steal)
  useEffect(() => {
    if (kbIndex < 0) return;
    const el = gridRef.current?.querySelector(
      `[data-kb-product-index="${kbIndex}"]`,
    ) as HTMLElement | null;
    const scroller = menuScrollRef.current;
    if (!el || !scroller) return;
    scrollChildIntoScroller(scroller, el, 12);
  }, [kbIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isDialogOpen()) return;
      if (
        dealProduct ||
        drinkProduct ||
        manualPriceProduct ||
        pizzaSizeProduct ||
        cancelPasswordOpen
      ) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const inSearch = Boolean(
        target?.closest?.("[data-pos-product-search='true']"),
      );
      const inTable = Boolean(
        target?.closest?.("[data-pos-table-input='true']"),
      );
      const inBill = Boolean(
        target?.closest?.("[data-pos-bill-panel='true']"),
      );

      // Table field or Current Bill panel: Enter prints / completes
      if ((inTable || inBill || billPanelActiveRef.current) && e.key === "Enter") {
        if (inSearch) {
          // Search bar still adds products.
        } else if (isTextEntryTarget(target) && !inTable) {
          return;
        } else {
          e.preventDefault();
          focusTableOrSavePending();
          return;
        }
      }

      // Slash focuses search (unless typing in another field)
      if (
        e.key === "/" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !inSearch &&
        !isTextEntryTarget(target)
      ) {
        e.preventDefault();
        focusSearch();
        return;
      }

      // F9 → table / save pending
      if (e.key === "F9") {
        e.preventDefault();
        focusTableOrSavePending();
        return;
      }

      // Ctrl+Enter → save pending
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        focusTableOrSavePending();
        return;
      }

      const isArrow =
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight";

      // From search: arrows move product highlight (keep typing focus)
      if (inSearch) {
        if (isArrow) {
          e.preventDefault();
          if (!filtered.length) return;
          const cols = countGridColumns(gridRef.current);
          markKbNav();
          setKbIndex((prev) => {
            const start = prev < 0 ? 0 : prev;
            return moveGridIndex(start, e.key, filtered.length, cols);
          });
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          addHighlightedProduct();
          return;
        }
        return;
      }

      // Don't steal keys from other inputs (phone, price, etc.)
      if (isTextEntryTarget(target) && !inTable) return;

      if (isArrow) {
        e.preventDefault();
        if (!filtered.length) return;
        const cols = countGridColumns(gridRef.current);
        markKbNav();
        setKbIndex((prev) => {
          const start = prev < 0 ? 0 : prev;
          return moveGridIndex(start, e.key, filtered.length, cols);
        });
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        addHighlightedProduct();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    addHighlightedProduct,
    cancelPasswordOpen,
    dealProduct,
    drinkProduct,
    filtered.length,
    focusSearch,
    focusTableOrSavePending,
    manualPriceProduct,
    markKbNav,
    pizzaSizeProduct,
  ]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[1fr_380px]">
      <div
        className="flex min-h-0 flex-col overflow-hidden lg:border-r lg:border-zinc-800"
        onPointerDown={() => {
          billPanelActiveRef.current = false;
        }}
      >
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
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs text-zinc-500">
          <span className="font-semibold text-orange-400/90">Keyboard</span>
          <span>↑↓←→ move (also while searching)</span>
          <span>·</span>
          <span>Enter add / choose size</span>
          <span>·</span>
          <span>/ search</span>
          <span>·</span>
          <span>F9 table / save</span>
          <span>·</span>
          <span>Ctrl+Enter pending</span>
          <span>·</span>
          <span>F1 New · F3 Pending</span>
        </div>
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

        <div
          ref={menuScrollRef}
          className="min-h-0 flex-1 overflow-y-auto p-3"
          onMouseMove={onMenuPointerMove}
        >
          <div
            ref={gridRef}
            className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
          >
            {filtered.map((product, index) => (
              <MemoProductTile
                key={product.id}
                product={product}
                currency={currency}
                onAdd={onProductClick}
                keyboardFocused={index === kbIndex}
                kbIndex={index}
                onKeyboardSelect={() => selectProductIndex(index)}
              />
            ))}
          </div>
          {!filtered.length && (
            <p className="p-8 text-center text-zinc-500">No products found</p>
          )}
        </div>
      </div>

      <aside
        data-pos-bill-panel="true"
        className="flex max-h-[50vh] min-h-0 flex-col border-t border-zinc-800 bg-zinc-950 lg:max-h-none lg:border-t-0"
        onPointerDown={() => {
          billPanelActiveRef.current = true;
        }}
      >
        <div className="shrink-0 border-b border-zinc-800 px-3 py-2">
          <h2 className="text-base font-black text-white">
            {bill.editingOrderId ? "Editing Pending Order" : "Current Bill"}
          </h2>
          {bill.editingOrderId ? (
            <p className="mt-0.5 text-[11px] text-amber-300">
              Changes will update the existing pending order.
            </p>
          ) : null}
          <div className="mt-1.5 flex gap-1.5">
            {ORDER_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={Boolean(bill.editingOrderId)}
                onClick={() => bill.setOrderType(t.id)}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-[11px] font-bold leading-tight",
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
          {isWalkin ? (
            <div className="mt-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: "dine_in" as const, label: "Dine In" },
                    { id: "parcel" as const, label: "Parcel" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      bill.setServiceMode(opt.id);
                      if (opt.id === "parcel") bill.setTableNumber("");
                    }}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-bold leading-tight",
                      bill.serviceMode === opt.id
                        ? "bg-orange-500 text-black"
                        : "bg-zinc-900 text-zinc-400",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {bill.serviceMode === "dine_in" ? (
                <div className="mt-1.5 space-y-0.5">
                  <Label className="text-[11px]">Table Number</Label>
                  <Input
                    ref={tableInputRef}
                    data-pos-table-input="true"
                    className="h-8"
                    value={bill.tableNumber}
                    placeholder="e.g. 5 — then Enter to save"
                    onChange={(e) => bill.setTableNumber(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          ref={billScrollRef}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2"
        >
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

          <div className="space-y-1.5">
            {bill.items.map((item, index) => {
              const product = products.find((p) => p.id === item.product_id);
              const sizeLabel = isPizzaSizeLabel(item.size)
                ? item.size
                : item.size && item.size !== "Regular"
                  ? item.size
                  : "";
              const pizzaSizes =
                product && isPizzaProduct(product)
                  ? pizzaSellableSizes(product.sizes)
                  : [];

              return (
                <div
                  key={item.key}
                  ref={
                    index === bill.items.length - 1 ? lastBillItemRef : undefined
                  }
                  className="rounded-md border border-zinc-800 bg-black/40 px-2 py-1.5"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-7 w-7"
                        onClick={() => bill.decrease(item.key)}
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-6 text-center text-sm font-bold tabular-nums">
                        {item.quantity}
                      </span>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-7 w-7"
                        onClick={() => bill.increase(item.key)}
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-bold leading-tight text-white"
                        title={item.product_name}
                      >
                        {item.product_name}
                      </p>
                      {item.allow_manual_price ? (
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                          <Input
                            className="h-7 w-20 text-xs"
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
                          {sizeLabel ? (
                            <span className="truncate text-[11px] text-zinc-500">
                              · {sizeLabel}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <p className="truncate text-xs text-orange-400">
                          {formatPrice(item.price, currency)}
                          {sizeLabel ? ` · ${sizeLabel}` : ""}
                        </p>
                      )}
                    </div>

                    <span className="shrink-0 text-sm font-bold tabular-nums text-white">
                      {formatPrice(item.price * item.quantity, currency)}
                    </span>
                    <button
                      type="button"
                      onClick={() => bill.remove(item.key)}
                      className="shrink-0 p-1 text-zinc-500 hover:text-red-400"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {pizzaSizes.length > 1 ? (
                    <div className="mt-1 flex flex-wrap gap-1 pl-[4.75rem]">
                      {pizzaSizes.map((s: ProductSize) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => bill.changeSize(item.key, s)}
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[11px] font-bold",
                            item.size_id === s.id
                              ? "bg-orange-500 text-black"
                              : "bg-zinc-800 text-zinc-400",
                          )}
                        >
                          {s.size}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!bill.items.length && (
              <p className="text-center text-sm text-zinc-500">
                Tap products to add
              </p>
            )}
          </div>

          {!isWalkin ? (
            <div>
              <Label className="mb-1 block text-[11px]">Payment</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {paymentOptions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => bill.setPaymentMethod(m.id)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-bold",
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
          ) : null}
        </div>

        <div className="shrink-0 space-y-0.5 border-t border-zinc-800 px-3 py-1.5 text-sm">
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
            <div className="flex justify-between border-t border-zinc-800 pt-1 text-base font-black text-white">
              <span>Grand Total</span>
              <span className="text-orange-400">
                {formatPrice(grandTotal, currency)}
              </span>
            </div>
          </div>

        <div className="grid shrink-0 grid-cols-2 gap-1.5 border-t border-zinc-800 p-2">
          <Button
            variant="secondary"
            onClick={() => placeOrder("PENDING")}
            disabled={busy}
          >
            {bill.editingOrderId
              ? settings?.pos_one_click_complete
                ? "Update & Complete"
                : "Update Pending"
              : settings?.pos_one_click_complete
                ? "Print & Complete"
                : "Save Pending"}
          </Button>
          <Button variant="outline" onClick={reprint}>
            <Printer className="h-4 w-4" /> Reprint
          </Button>
          <Button
            variant="danger"
            onClick={() => setCancelPasswordOpen(true)}
            disabled={busy}
          >
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
          if (!open) {
            setDealProduct(null);
            focusSearch();
          }
        }}
        onConfirm={onDealConfirm}
      />
      <DrinkFlavorDialog
        open={Boolean(drinkProduct)}
        product={drinkProduct}
        flavorsRaw={settings?.drink_flavors}
        onOpenChange={(open) => {
          if (!open) {
            setDrinkProduct(null);
            focusSearch();
          }
        }}
        onConfirm={onDrinkConfirm}
      />
      <ManualPriceDialog
        open={Boolean(manualPriceProduct)}
        product={manualPriceProduct}
        onOpenChange={(open) => {
          if (!open) {
            setManualPriceProduct(null);
            focusSearch();
          }
        }}
        onConfirm={onManualPriceConfirm}
      />
      <PizzaSizeDialog
        open={Boolean(pizzaSizeProduct)}
        product={pizzaSizeProduct}
        onOpenChange={(open) => {
          if (!open) {
            setPizzaSizeProduct(null);
            focusSearch();
          }
        }}
        onConfirm={onPizzaSizeConfirm}
      />
      <CancelOrderPasswordDialog
        open={cancelPasswordOpen}
        onOpenChange={setCancelPasswordOpen}
        onConfirm={cancelBill}
      />
    </div>
  );
}

function ProductTile({
  product,
  currency,
  onAdd,
  keyboardFocused,
  kbIndex,
  onKeyboardSelect,
}: {
  product: Product;
  currency: string;
  onAdd: (p: Product, size?: ProductSize) => void;
  keyboardFocused?: boolean;
  kbIndex?: number;
  onKeyboardSelect?: () => void;
}) {
  const sizes = isPizzaProduct(product)
    ? pizzaSellableSizes(product.sizes)
    : product.sizes || [];
  const prices = sizes.map((s) => s.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const multiSize = isPizzaProduct(product) && sizes.length > 1;

  return (
    <div
      data-kb-product-index={kbIndex}
      onMouseEnter={() => onKeyboardSelect?.()}
      className={cn(
        "relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-left transition hover:border-orange-500",
        keyboardFocused && "pos-kb-focus",
      )}
    >
      {keyboardFocused ? (
        <span className="pos-kb-focus-badge" aria-hidden>
          Selected
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => {
          onKeyboardSelect?.();
          if (multiSize) onAdd(product);
          else onAdd(product, sizes[0]);
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
                onKeyboardSelect?.();
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
