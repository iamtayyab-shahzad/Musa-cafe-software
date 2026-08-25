"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CART_STORAGE_KEY } from "@/lib/constants";
import { isDealProduct } from "@/lib/deal-flavors";
import { weekendDiscount } from "@/lib/discount-rules";
import type { CartItem, Product, ProductSize } from "@/types";

interface CartStateValue {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  discount: number;
  payable: number;
}

interface CartActionsValue {
  addItem: (
    product: Product,
    size: ProductSize,
    quantity?: number,
    specialInstructions?: string,
  ) => void;
  changeSize: (id: string, size: ProductSize) => void;
  updateQuantity: (id: string, quantity: number) => void;
  updateInstructions: (id: string, instructions: string) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
}


const CartStateContext = createContext<CartStateValue | null>(null);
const CartActionsContext = createContext<CartActionsValue | null>(null);

/** Stable short hash so distinct instructions become distinct cart lines. */
function hashInstructions(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function makeCartItemId(
  productId: string,
  sizeId: string,
  instructions?: string,
) {
  const base = `${productId}__${sizeId}`;
  // Deals (and any item with special instructions) must not merge into an
  // existing line, otherwise a second deal with different pizza flavours would
  // silently overwrite the first line's flavour note.
  return instructions ? `${base}__${hashInstructions(instructions)}` : base;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [rulesTick, setRulesTick] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        const uuidRe =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        setItems(
          parsed.filter(
            (item) =>
              uuidRe.test(item.product_id || "") &&
              uuidRe.test(item.size_id || "") &&
              Number(item.quantity) > 0,
          ),
        );
      }
    } catch {
      setItems([]);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    void import("@/services/api")
      .then(({ getActiveDiscountRules }) => getActiveDiscountRules())
      .then(() => setRulesTick((n) => n + 1))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const onRules = () => setRulesTick((n) => n + 1);
    window.addEventListener("discount-rules-updated", onRules);
    return () => window.removeEventListener("discount-rules-updated", onRules);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const addItem = useCallback(
    (
      product: Product,
      size: ProductSize,
      quantity = 1,
      specialInstructions?: string,
    ) => {
      const id = makeCartItemId(product.id, size.id, specialInstructions);
      setItems((prev) => {
        const existing = prev.find((item) => item.id === id);
        if (existing) {
          return prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  quantity: item.quantity + quantity,
                  special_instructions:
                    specialInstructions ?? item.special_instructions,
                }
              : item,
          );
        }
        return [
          ...prev,
          {
            id,
            product_id: product.id,
            product_name: product.name,
            product_image: product.image,
            size_id: size.id,
            size: size.size,
            price: size.price,
            quantity,
            special_instructions: specialInstructions,
            is_deal: isDealProduct(product),
            was_price: size.was_price || undefined,
          },
        ];
      });
    },
    [],
  );

  const changeSize = useCallback((id: string, size: ProductSize) => {
    setItems((prev) => {
      const line = prev.find((item) => item.id === id);
      if (!line) return prev;
      const newId = makeCartItemId(
        line.product_id,
        size.id,
        line.special_instructions,
      );
      if (newId === id) {
        return prev.map((item) =>
          item.id === id
            ? {
                ...item,
                size_id: size.id,
                size: size.size,
                price: size.price,
              }
            : item,
        );
      }
      const existing = prev.find((item) => item.id === newId);
      if (existing) {
        return prev
          .filter((item) => item.id !== id)
          .map((item) =>
            item.id === newId
              ? { ...item, quantity: item.quantity + line.quantity }
              : item,
          );
      }
      return prev.map((item) =>
        item.id === id
          ? {
              ...item,
              id: newId,
              size_id: size.id,
              size: size.size,
              price: size.price,
            }
          : item,
      );
    });
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    setItems((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, quantity: Math.max(0, quantity) } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }, []);

  const updateInstructions = useCallback((id: string, instructions: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const notes = instructions.trim() || undefined;
        return {
          ...item,
          id: makeCartItemId(item.product_id, item.size_id, notes),
          special_instructions: notes,
        };
      }),
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const state = useMemo<CartStateValue>(() => {
    const subtotal = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const discount = weekendDiscount(items);
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    return {
      items,
      itemCount,
      subtotal,
      discount,
      payable: Math.max(0, subtotal - discount),
    };
  }, [items, rulesTick]);

  const actions = useMemo<CartActionsValue>(
    () => ({
      addItem,
      changeSize,
      updateQuantity,
      updateInstructions,
      removeItem,
      clearCart,
    }),
    [
      addItem,
      changeSize,
      updateQuantity,
      updateInstructions,
      removeItem,
      clearCart,
    ],
  );

  return (
    <CartStateContext.Provider value={state}>
      <CartActionsContext.Provider value={actions}>
        {children}
      </CartActionsContext.Provider>
    </CartStateContext.Provider>
  );
}

/** Stable actions — safe for product cards that must not re-render on cart edits. */
export function useCartActions() {
  const ctx = useContext(CartActionsContext);
  if (!ctx) throw new Error("useCartActions must be used within CartProvider");
  return ctx;
}

export function useCart() {
  const state = useContext(CartStateContext);
  const actions = useContext(CartActionsContext);
  if (!state || !actions) {
    throw new Error("useCart must be used within CartProvider");
  }
  return { ...state, ...actions };
}
