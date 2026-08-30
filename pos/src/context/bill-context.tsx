"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  BillLine,
  OrderType,
  PaymentMethod,
  PendingDraft,
  Product,
  ProductSize,
} from "@/types";
import {
  defaultPaymentForOrderType,
  makeLineKey,
  WALKIN_LOCATION_ID,
} from "@/lib/utils";
import { isDealProduct } from "@/lib/deal-flavors";
import { weekendDiscount } from "@/lib/discount-rules";
import { deleteDraft, getDraft, saveDraft } from "@/lib/offline-db";
import {
  encodeWalkinOrderNotes,
  parseServiceMode,
  parseTableNumber,
  type WalkinServiceMode,
} from "@/lib/receipt";

const ACTIVE_DRAFT_ID = "active-cart";

interface BillState {
  draftId: string | null;
  editingOrderId: string | null;
  orderType: OrderType;
  customerName: string;
  phone: string;
  address: string;
  locationId: string;
  deliveryCharge: number;
  paymentMethod: PaymentMethod;
  orderNotes: string;
  tableNumber: string;
  serviceMode: WalkinServiceMode;
  items: BillLine[];
}

interface BillContextValue extends BillState {
  setOrderType: (v: OrderType) => void;
  setCustomerName: (v: string) => void;
  setPhone: (v: string) => void;
  setAddress: (v: string) => void;
  setLocation: (id: string, charge: number) => void;
  setPaymentMethod: (v: PaymentMethod) => void;
  setOrderNotes: (v: string) => void;
  setTableNumber: (v: string) => void;
  setServiceMode: (v: WalkinServiceMode) => void;
  addProduct: (
    product: Product,
    size: ProductSize,
    opts?: { special_instructions?: string; price?: number },
  ) => void;
  changeSize: (key: string, size: ProductSize) => void;
  increase: (key: string) => void;
  decrease: (key: string) => void;
  remove: (key: string) => void;
  setLinePrice: (key: string, price: number) => void;
  setInstructions: (key: string, text: string) => void;
  setLineMeta: (
    key: string,
    meta: Partial<Pick<BillLine, "crust" | "toppings" | "extras" | "special_instructions">>,
  ) => void;
  loadDraft: (partial: Partial<BillState> & { items: BillLine[] }) => void;
  clearBill: () => void;
  subtotal: number;
  discount: number;
  cartRecovered: boolean;
}

const defaults: BillState = {
  draftId: null,
  editingOrderId: null,
  orderType: "walkin",
  customerName: "Walk-in Customer",
  phone: "0000000000",
  address: "",
  locationId: WALKIN_LOCATION_ID,
  deliveryCharge: 0,
  paymentMethod: "cash",
  orderNotes: "",
  tableNumber: "",
  serviceMode: "dine_in",
  items: [],
};

/** Fresh customer fields after clear / type switch — phone orders must not keep zeros. */
function customerFieldsForOrderType(orderType: OrderType): Pick<
  BillState,
  | "customerName"
  | "phone"
  | "address"
  | "locationId"
  | "deliveryCharge"
  | "paymentMethod"
> {
  if (orderType === "walkin") {
    return {
      customerName: "Walk-in Customer",
      phone: "0000000000",
      address: "",
      locationId: WALKIN_LOCATION_ID,
      deliveryCharge: 0,
      paymentMethod: defaultPaymentForOrderType(orderType),
    };
  }
  return {
    customerName: "",
    phone: "",
    address: "",
    locationId: "",
    deliveryCharge: 0,
    paymentMethod: defaultPaymentForOrderType(orderType),
  };
}

const BillContext = createContext<BillContextValue | null>(null);

function toPendingDraft(state: BillState): PendingDraft {
  const now = new Date().toISOString();
  return {
    id: state.draftId || ACTIVE_DRAFT_ID,
    created_at: now,
    updated_at: now,
    order_type: state.orderType,
    customer_name: state.customerName,
    phone: state.phone,
    address: state.address,
    location_id: state.locationId,
    delivery_charge: state.deliveryCharge,
    payment_method: state.paymentMethod,
    order_notes:
      state.orderType === "walkin"
        ? encodeWalkinOrderNotes({
            tableNumber: state.tableNumber,
            serviceMode: state.serviceMode,
            extraNotes: state.orderNotes,
          })
        : state.orderNotes,
    items: state.items,
  };
}

export function BillProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BillState>(defaults);
  const [cartRecovered, setCartRecovered] = useState(false);
  const [rulesTick, setRulesTick] = useState(0);

  useEffect(() => {
    const onRules = () => setRulesTick((n) => n + 1);
    window.addEventListener("discount-rules-updated", onRules);
    return () => window.removeEventListener("discount-rules-updated", onRules);
  }, []);
  const hydrated = useRef(false);
  const skipPersist = useRef(true);

  // Restore cart draft on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draft = await getDraft(ACTIVE_DRAFT_ID);
        if (cancelled) return;
        if (draft && draft.items?.length) {
          setState({
            draftId: draft.id,
            editingOrderId: null,
            orderType: draft.order_type,
            customerName: draft.customer_name,
            phone: draft.phone,
            address: draft.address,
            locationId: draft.location_id,
            deliveryCharge: draft.delivery_charge,
            paymentMethod: draft.payment_method,
            orderNotes: "",
            tableNumber: parseTableNumber(draft.order_notes),
            serviceMode: parseServiceMode(draft.order_notes),
            items: draft.items,
          });
          setCartRecovered(true);
        } else {
          setState((p) => ({ ...p, draftId: ACTIVE_DRAFT_ID }));
        }
      } catch {
        setState((p) => ({ ...p, draftId: ACTIVE_DRAFT_ID }));
      } finally {
        hydrated.current = true;
        skipPersist.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Autosave cart draft (debounced). Longer while offline to cut IndexedDB thrash.
  useEffect(() => {
    if (!hydrated.current || skipPersist.current) return;
    if (state.editingOrderId) return; // don't overwrite active cart while editing pending
    const offline =
      typeof navigator !== "undefined" && !navigator.onLine;
    const delay = offline ? 1_200 : 400;
    const timer = setTimeout(() => {
      const draft = toPendingDraft({
        ...state,
        draftId: state.draftId || ACTIVE_DRAFT_ID,
      });
      if (!draft.items.length) {
        void deleteDraft(ACTIVE_DRAFT_ID);
        return;
      }
      void saveDraft(draft);
    }, delay);
    return () => clearTimeout(timer);
  }, [
    state.draftId,
    state.editingOrderId,
    state.orderType,
    state.customerName,
    state.phone,
    state.address,
    state.locationId,
    state.deliveryCharge,
    state.paymentMethod,
    state.orderNotes,
    state.tableNumber,
    state.serviceMode,
    state.items,
  ]);

  const addProduct = useCallback(
    (
      product: Product,
      size: ProductSize,
      opts?: { special_instructions?: string; price?: number },
    ) => {
      const instructions = opts?.special_instructions?.trim() || undefined;
      const manualPrice = product.allow_manual_price
        ? opts?.price ?? size.price
        : size.price;
      const key = makeLineKey(
        product.id,
        size.id,
        instructions,
        product.allow_manual_price ? manualPrice : undefined,
      );
      setState((prev) => {
        const existing = prev.items.find((i) => i.key === key);
        if (existing) {
          return {
            ...prev,
            draftId: prev.draftId || ACTIVE_DRAFT_ID,
            items: prev.items.map((i) =>
              i.key === key ? { ...i, quantity: i.quantity + 1 } : i,
            ),
          };
        }
        return {
          ...prev,
          draftId: prev.draftId || ACTIVE_DRAFT_ID,
          items: [
            ...prev.items,
            {
              key,
              product_id: product.id,
              product_name: product.name,
              product_image: product.image,
              size_id: size.id,
              size: size.size,
              price: manualPrice,
              quantity: 1,
              special_instructions: instructions,
              is_deal: isDealProduct(product),
              allow_manual_price: product.allow_manual_price,
              was_price: size.was_price || undefined,
            },
          ],
        };
      });
    },
    [],
  );

  const value = useMemo<BillContextValue>(() => {
    const subtotal = state.items.reduce(
      (s, i) => s + i.price * i.quantity,
      0,
    );
    const discount = weekendDiscount(state.items);
    return {
      ...state,
      cartRecovered,
      subtotal,
      discount,
      setOrderType: (orderType) =>
        setState((p) => {
          if (orderType === "walkin") {
            return {
              ...p,
              orderType,
              ...customerFieldsForOrderType("walkin"),
            };
          }
          const fields = customerFieldsForOrderType(orderType);
          return {
            ...p,
            orderType,
            // Keep a real customer name when switching away from walk-in.
            customerName:
              p.customerName === "Walk-in Customer" ? "" : p.customerName,
            phone: p.phone === "0000000000" ? "" : p.phone,
            locationId:
              p.locationId === WALKIN_LOCATION_ID ? "" : p.locationId,
            deliveryCharge:
              p.locationId === WALKIN_LOCATION_ID ? 0 : p.deliveryCharge,
            paymentMethod: fields.paymentMethod,
            address: p.locationId === WALKIN_LOCATION_ID ? "" : p.address,
          };
        }),
      setCustomerName: (customerName) =>
        setState((p) => ({ ...p, customerName })),
      setPhone: (phone) => setState((p) => ({ ...p, phone })),
      setAddress: (address) => setState((p) => ({ ...p, address })),
      setLocation: (locationId, deliveryCharge) =>
        setState((p) => ({ ...p, locationId, deliveryCharge })),
      setPaymentMethod: (paymentMethod) =>
        setState((p) => ({ ...p, paymentMethod })),
      setOrderNotes: (orderNotes) => setState((p) => ({ ...p, orderNotes })),
      setTableNumber: (tableNumber) => setState((p) => ({ ...p, tableNumber })),
      setServiceMode: (serviceMode) => setState((p) => ({ ...p, serviceMode })),
      addProduct,
      changeSize: (key, size) =>
        setState((p) => {
          const line = p.items.find((i) => i.key === key);
          if (!line) return p;
          const newKey = makeLineKey(
            line.product_id,
            size.id,
            line.special_instructions,
          );
          if (newKey === key) {
            return {
              ...p,
              items: p.items.map((i) =>
                i.key === key
                  ? {
                      ...i,
                      size_id: size.id,
                      size: size.size,
                      price: size.price,
                    }
                  : i,
              ),
            };
          }
          const existing = p.items.find((i) => i.key === newKey);
          if (existing) {
            return {
              ...p,
              items: p.items
                .filter((i) => i.key !== key)
                .map((i) =>
                  i.key === newKey
                    ? { ...i, quantity: i.quantity + line.quantity }
                    : i,
                ),
            };
          }
          return {
            ...p,
            items: p.items.map((i) =>
              i.key === key
                ? {
                    ...i,
                    key: newKey,
                    size_id: size.id,
                    size: size.size,
                    price: size.price,
                  }
                : i,
            ),
          };
        }),
      increase: (key) =>
        setState((p) => ({
          ...p,
          items: p.items.map((i) =>
            i.key === key ? { ...i, quantity: i.quantity + 1 } : i,
          ),
        })),
      decrease: (key) =>
        setState((p) => ({
          ...p,
          items: p.items
            .map((i) =>
              i.key === key ? { ...i, quantity: i.quantity - 1 } : i,
            )
            .filter((i) => i.quantity > 0),
        })),
      remove: (key) =>
        setState((p) => ({
          ...p,
          items: p.items.filter((i) => i.key !== key),
        })),
      setLinePrice: (key, price) =>
        setState((p) => ({
          ...p,
          items: p.items.map((i) => {
            if (i.key !== key || !i.allow_manual_price) return i;
            const nextPrice = Math.max(1, Math.round(price));
            return {
              ...i,
              price: nextPrice,
              key: makeLineKey(
                i.product_id,
                i.size_id,
                i.special_instructions,
                nextPrice,
              ),
            };
          }),
        })),
      setInstructions: (key, text) =>
        setState((p) => ({
          ...p,
          items: p.items.map((i) => {
            if (i.key !== key) return i;
            const notes = text.trim() || undefined;
            return {
              ...i,
              key: makeLineKey(i.product_id, i.size_id, notes),
              special_instructions: notes,
            };
          }),
        })),
      setLineMeta: (key, meta) =>
        setState((p) => ({
          ...p,
          items: p.items.map((i) => {
            if (i.key !== key) return i;
            const next = { ...i, ...meta };
            if ("special_instructions" in meta) {
              const notes = next.special_instructions?.trim() || undefined;
              next.special_instructions = notes;
              next.key = makeLineKey(next.product_id, next.size_id, notes);
            }
            return next;
          }),
        })),
      loadDraft: (partial) =>
        setState((p) => ({
          ...p,
          ...partial,
        })),
      clearBill: () => {
        void deleteDraft(ACTIVE_DRAFT_ID);
        setCartRecovered(false);
        setState((p) => ({
          ...defaults,
          draftId: ACTIVE_DRAFT_ID,
          orderType: p.orderType,
          // Preserve channel (phone/walkin/website) but reset customer fields
          // so the next phone order does not keep 0000000000 in the number box.
          ...customerFieldsForOrderType(p.orderType),
          orderNotes: "",
          tableNumber: "",
          serviceMode: "dine_in",
          items: [],
          editingOrderId: null,
        }));
      },
    };
  }, [state, addProduct, cartRecovered, rulesTick]);

  return <BillContext.Provider value={value}>{children}</BillContext.Provider>;
}

export function useBill() {
  const ctx = useContext(BillContext);
  if (!ctx) throw new Error("useBill must be used within BillProvider");
  return ctx;
}
