import { apiFetch, ApiError } from "@/lib/api-client";
import type {
  Category,
  Deal,
  Expense,
  InventoryItem,
  PizzaSize,
  Product,
  Purchase,
  Supplier,
} from "@/lib/types";

type BackendCategory = {
  id: string;
  name: string;
  image: string;
  display_order: number;
  visible: boolean;
};

type BackendProduct = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  image: string;
  featured: boolean;
  available: boolean;
  allow_manual_price?: boolean;
  display_order: number;
};

type BackendProductSize = {
  id: string;
  product_id: string;
  size: string;
  price: number;
};

type BackendOffer = {
  id: string;
  title: string;
  description: string;
  image: string;
  active: boolean;
  start_date?: string | null;
  end_date?: string | null;
  offer_popup: boolean;
  homepage_deal: boolean;
  discount_label: string;
};

type BackendLocation = {
  id: string;
  name: string;
  delivery_charge: number;
};

export type BackendSetting = {
  id: string;
  restaurant_name: string;
  phone: string;
  whatsapp: string;
  logo: string;
  address: string;
  opening_time: string;
  closing_time: string;
  cash_on_delivery_fee: number;
  currency: string;
  google_maps: string;
  facebook: string;
  instagram: string;
  drink_flavors?: string;
  /** First-visit website appearance: dark | dim | light | warm */
  default_site_theme?: string;
  pos_one_click_complete?: boolean;
  pos_allow_history_edit?: boolean;
};

type BackendInventory = {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_kind?: string;
  purchase_unit?: string;
  units_per_purchase?: number;
  stock: number;
  purchase_price: number;
  avg_cost_micros?: number;
  minimum_stock: number;
  supplier: string;
  supplier_id?: string;
  is_active?: boolean;
};

type BackendInventoryTransaction = {
  id: string;
  inventory_id: string;
  quantity: number;
  transaction_type: string;
  reason: string;
  created_at: string;
  total_cost?: number;
  balance_after?: number;
  inventory?: { id: string; name: string; unit?: string };
};

type BackendRecipe = {
  id: string;
  product_id: string;
  product_size_id?: string | null;
  inventory_id: string;
  quantity_required: number;
  product?: { id: string; name: string };
  product_size?: { id: string; size: string } | null;
  inventory?: { id: string; name: string; unit: string };
};

export type BackendOrderItem = {
  id: string;
  product_id: string;
  product_size_id: string;
  quantity: number;
  price: number;
  special_instructions?: string;
  product?: { id: string; name: string };
  product_size?: { id: string; size: string; price: number };
};

export type BackendOrder = {
  id: string;
  order_number: string;
  customer_id?: string;
  customer_name: string;
  phone: string;
  address: string;
  location_id: string;
  delivery_charge: number;
  cash_on_delivery_fee: number;
  payment_method: string;
  order_status: "PENDING" | "COMPLETED" | "CANCELLED";
  order_type: string;
  order_notes: string;
  subtotal: number;
  grand_total: number;
  items: BackendOrderItem[];
  created_at: string;
  updated_at: string;
};

function slugify(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function mapCategory(cat: BackendCategory): Category {
  return {
    id: cat.id,
    name: cat.name,
    slug: slugify(cat.name),
    image: cat.image,
    displayOrder: cat.display_order,
    hidden: !cat.visible,
  };
}

function mapProduct(p: BackendProduct, sizes: BackendProductSize[]): Product {
  const pizzaSizes: PizzaSize[] = sizes.map((s) => ({
    id: s.id,
    label: s.size,
    price: s.price,
  }));
  const basePrice = pizzaSizes[0]?.price ?? 0;
  return {
    id: p.id,
    name: p.name,
    categoryId: p.category_id,
    description: p.description,
    image: p.image,
    available: p.available,
    featured: p.featured,
    allowManualPrice: Boolean(p.allow_manual_price),
    basePrice,
    pizzaSizes,
  };
}

function mapOffer(o: BackendOffer): Deal {
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    image: o.image,
    enabled: o.active,
    offerPopup: o.offer_popup,
    homepageDeal: o.homepage_deal,
    discountLabel: o.discount_label,
  };
}

function mapInventory(i: BackendInventory): InventoryItem {
  const stock = Number(i.stock || 0);
  const avg = Number(i.avg_cost_micros || 0);
  return {
    id: i.id,
    name: i.name,
    category: i.category || "",
    currentStock: stock,
    unit: i.unit,
    unitKind: i.unit_kind || "WEIGHT",
    purchaseUnit: i.purchase_unit || i.unit,
    unitsPerPurchase: Number(i.units_per_purchase || 1),
    purchasePrice: Number(i.purchase_price || 0),
    avgCostMicros: avg,
    minimumStock: Number(i.minimum_stock || 0),
    supplier: i.supplier || "",
    supplierId: i.supplier_id,
    isActive: i.is_active !== false,
    stockValue: Math.round((Math.max(stock, 0) * avg) / 1_000_000),
  };
}

async function fetchAllProductSizes(): Promise<BackendProductSize[]> {
  return apiFetch<BackendProductSize[]>("/product-sizes");
}

export const categoriesApi = {
  list: async () => {
    const cats = await apiFetch<BackendCategory[]>("/categories");
    return cats.map(mapCategory).sort((a, b) => a.displayOrder - b.displayOrder);
  },
  create: async (payload: {
    name: string;
    image: string;
    displayOrder: number;
    hidden: boolean;
  }) => {
    await apiFetch<unknown>("/categories", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        image: payload.image,
        display_order: Number(payload.displayOrder || 0),
        visible: !payload.hidden,
      }),
    });
  },
  update: async (
    id: string,
    payload: { name: string; image: string; displayOrder: number; hidden: boolean },
  ) => {
    await apiFetch<unknown>(`/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: payload.name,
        image: payload.image,
        display_order: Number(payload.displayOrder || 0),
        visible: !payload.hidden,
      }),
    });
  },
  remove: async (id: string) => {
    await apiFetch<unknown>(`/categories/${id}`, { method: "DELETE" });
  },
};

export const productsApi = {
  list: async (): Promise<Product[]> => {
    const [products, sizes] = await Promise.all([
      apiFetch<BackendProduct[]>("/products"),
      fetchAllProductSizes(),
    ]);
    const sizesByProduct = new Map<string, BackendProductSize[]>();
    for (const s of sizes) {
      const arr = sizesByProduct.get(s.product_id) || [];
      arr.push(s);
      sizesByProduct.set(s.product_id, arr);
    }
    return products
      .sort((a, b) => a.display_order - b.display_order)
      .map((p) => mapProduct(p, sizesByProduct.get(p.id) || []));
  },
  create: async (payload: Omit<Product, "id" | "basePrice">) => {
    // Create product first (backend assigns id if omitted)
    const created = await apiFetch<BackendProduct>("/products", {
      method: "POST",
      body: JSON.stringify({
        category_id: payload.categoryId,
        name: payload.name,
        description: payload.description,
        image: payload.image,
        featured: payload.featured,
        available: payload.available,
        allow_manual_price: Boolean(payload.allowManualPrice),
      }),
    });

    for (const s of payload.pizzaSizes || []) {
      await apiFetch<BackendProductSize>("/product-sizes", {
        method: "POST",
        body: JSON.stringify({
          product_id: created.id,
          size: s.label,
          price: Number(s.price || 0),
        }),
      });
    }
  },
  update: async (
    id: string,
    payload: {
      categoryId: string;
      name: string;
      description: string;
      image: string;
      featured: boolean;
      available: boolean;
      allowManualPrice?: boolean;
      pizzaSizes: PizzaSize[];
    },
  ) => {
    await apiFetch<unknown>(`/products/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        category_id: payload.categoryId,
        name: payload.name,
        description: payload.description,
        image: payload.image,
        featured: payload.featured,
        available: payload.available,
        allow_manual_price: Boolean(payload.allowManualPrice),
      }),
    });

    const allSizes = await fetchAllProductSizes();
    const existing = allSizes.filter((s) => s.product_id === id);
    const desiredLabels = new Set(
      (payload.pizzaSizes || []).map((s) => s.label.trim()).filter(Boolean),
    );

    // Delete removed sizes (keep sizes already used on tickets)
    for (const e of existing) {
      const label = e.size.trim();
      if (!desiredLabels.has(label)) {
        try {
          await apiFetch<unknown>(`/product-sizes/${e.id}`, { method: "DELETE" });
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 409) throw err;
        }
      }
    }

    // Create/update desired sizes
    for (const d of payload.pizzaSizes || []) {
      const label = d.label.trim();
      if (!label) continue;
      const match =
        existing.find((e) => d.id && e.id === d.id) ||
        existing.find(
          (e) => e.size.trim().toLowerCase() === label.toLowerCase(),
        );
      if (match) {
        await apiFetch<unknown>(`/product-sizes/${match.id}`, {
          method: "PUT",
          body: JSON.stringify({ size: label, price: Math.round(Number(d.price || 0)) }),
        });
      } else {
        await apiFetch<BackendProductSize>("/product-sizes", {
          method: "POST",
          body: JSON.stringify({
            product_id: id,
            size: label,
            price: Math.round(Number(d.price || 0)),
          }),
        });
      }
    }
  },
  remove: async (id: string) => {
    await apiFetch<unknown>(`/products/${id}`, { method: "DELETE" });
  },
};

export const offersApi = {
  list: async (): Promise<Deal[]> => {
    const offers = await apiFetch<BackendOffer[]>("/offers");
    return offers
      .slice()
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map(mapOffer);
  },
  create: async (payload: {
    title: string;
    description: string;
    image: string;
    enabled: boolean;
    offerPopup: boolean;
    homepageDeal: boolean;
    discountLabel: string;
  }) => {
    await apiFetch<unknown>("/offers", {
      method: "POST",
      body: JSON.stringify({
        title: payload.title,
        description: payload.description,
        image: payload.image,
        active: payload.enabled,
        offer_popup: payload.offerPopup,
        homepage_deal: payload.homepageDeal,
        discount_label: payload.discountLabel,
      }),
    });
  },
  update: async (id: string, updates: Partial<BackendOffer>) => {
    await apiFetch<unknown>(`/offers/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  },
  remove: async (id: string) => {
    await apiFetch<unknown>(`/offers/${id}`, { method: "DELETE" });
  },
  enable: async (id: string) => {
    await apiFetch<unknown>(`/offers/${id}/enable`, { method: "PATCH" });
  },
  disable: async (id: string) => {
    await apiFetch<unknown>(`/offers/${id}/disable`, { method: "PATCH" });
  },
};

export type DiscountRuleRow = {
  id: string;
  name: string;
  active: boolean;
  percent: number;
  min_subtotal: number;
  schedule_type: string;
  start_date?: string | null;
  end_date?: string | null;
  weekdays_json: string;
  exclude_deals: boolean;
};

export const discountRulesApi = {
  list: () => apiFetch<DiscountRuleRow[]>("/discount-rules"),
  create: (payload: Record<string, unknown>) =>
    apiFetch<DiscountRuleRow>("/discount-rules", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, updates: Record<string, unknown>) =>
    apiFetch<unknown>(`/discount-rules/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  remove: (id: string) =>
    apiFetch<unknown>(`/discount-rules/${id}`, { method: "DELETE" }),
  enable: (id: string) =>
    apiFetch<unknown>(`/discount-rules/${id}/enable`, { method: "PATCH" }),
  disable: (id: string) =>
    apiFetch<unknown>(`/discount-rules/${id}/disable`, { method: "PATCH" }),
};

export type DeliveryLocationRow = {
  id: string;
  name: string;
  charge: number;
};

export const locationsApi = {
  list: async (): Promise<DeliveryLocationRow[]> => {
    const rows = await apiFetch<BackendLocation[]>("/locations");
    return rows
      .slice()
      .sort((a, b) => a.delivery_charge - b.delivery_charge)
      .map((l) => ({ id: l.id, name: l.name, charge: l.delivery_charge }));
  },
  create: async (payload: { name: string; charge: number }) => {
    await apiFetch<BackendLocation>("/locations", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        delivery_charge: Number(payload.charge || 0),
      }),
    });
  },
  update: async (id: string, payload: { name: string; charge: number }) => {
    await apiFetch<unknown>(`/locations/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: payload.name,
        delivery_charge: Number(payload.charge || 0),
      }),
    });
  },
  remove: async (id: string) => {
    await apiFetch<unknown>(`/locations/${id}`, { method: "DELETE" });
  },
};

export type SettingsUpdatePayload = {
  restaurant_name?: string;
  phone?: string;
  whatsapp?: string;
  logo?: string;
  address?: string;
  opening_time?: string;
  closing_time?: string;
  cash_on_delivery_fee?: number;
  currency?: string;
  google_maps?: string;
  facebook?: string;
  instagram?: string;
  drink_flavors?: string;
  /** First-visit website appearance: dark | dim | light | warm */
  default_site_theme?: string;
  pos_one_click_complete?: boolean;
  pos_allow_history_edit?: boolean;
};

export const settingsApi = {
  get: async (): Promise<BackendSetting> => {
    return apiFetch<BackendSetting>("/settings/public", {}, false);
  },
  update: async (payload: SettingsUpdatePayload): Promise<BackendSetting> => {
    return apiFetch<BackendSetting>("/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  updateCodFee: async (fee: number) => {
    await apiFetch<BackendSetting>("/settings", {
      method: "PUT",
      body: JSON.stringify({ cash_on_delivery_fee: Number(fee || 0) }),
    });
  },
};

export type AnalyticsSalesTotal = { total: number };
export type AnalyticsCancelledCount = { count: number };
export type AnalyticsBestSellingRow = {
  product_id: string;
  product_name: string;
  quantity: number;
};
export type AnalyticsPaymentRow = {
  method: string;
  total: number;
};
export type AnalyticsInventoryRow = {
  id: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  purchase_price: number;
  minimum_stock: number;
  supplier: string;
};

export type AnalyticsSalesPeriodItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  revenue: number;
};

export type AnalyticsSalesPeriod = {
  total: number;
  order_count: number;
  from: string;
  to: string;
  items?: AnalyticsSalesPeriodItem[];
};

export const analyticsApi = {
  todaySales: () =>
    apiFetch<AnalyticsSalesTotal>("/analytics/today-sales"),
  yesterdaySales: () =>
    apiFetch<AnalyticsSalesTotal>("/analytics/yesterday-sales"),
  weeklySales: () =>
    apiFetch<AnalyticsSalesTotal>("/analytics/weekly-sales"),
  monthlySales: () =>
    apiFetch<AnalyticsSalesTotal>("/analytics/monthly-sales"),
  /** Single day: { date } or range: { from, to } — Asia/Karachi calendar days. */
  salesForPeriod: (params: { date: string } | { from: string; to: string }) => {
    const q =
      "date" in params
        ? `date=${encodeURIComponent(params.date)}`
        : `from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}`;
    return apiFetch<AnalyticsSalesPeriod>(`/analytics/sales?${q}`);
  },
  bestSellingProducts: () =>
    apiFetch<AnalyticsBestSellingRow[]>("/analytics/best-selling-products"),
  cancelledOrders: () =>
    apiFetch<AnalyticsCancelledCount>("/analytics/cancelled-orders"),
  paymentBreakdown: () =>
    apiFetch<AnalyticsPaymentRow[]>("/analytics/payment-breakdown"),
  remainingInventory: () =>
    apiFetch<AnalyticsInventoryRow[]>("/analytics/remaining-inventory"),
  lowStock: () =>
    apiFetch<AnalyticsInventoryRow[]>("/analytics/low-stock"),
};

export type InventoryPayload = {
  name: string;
  category: string;
  unitKind?: string;
  unit?: string;
  purchaseUnit?: string;
  unitsPerPurchase?: number;
  currentStock: number;
  minimumStock: number;
  purchasePrice: number;
  supplier: string;
  supplierId?: string;
  isActive?: boolean;
};

function inventoryBody(payload: InventoryPayload) {
  return {
    name: payload.name,
    category: payload.category,
    unit_kind: payload.unitKind || undefined,
    unit: payload.unit,
    purchase_unit: payload.purchaseUnit,
    units_per_purchase: Number(payload.unitsPerPurchase || 0) || undefined,
    stock: Number(payload.currentStock || 0),
    minimum_stock: Number(payload.minimumStock || 0),
    purchase_price: Number(payload.purchasePrice || 0),
    supplier: payload.supplier,
    supplier_id: payload.supplierId || undefined,
    is_active: payload.isActive,
  };
}

export const inventoryApi = {
  list: async (): Promise<InventoryItem[]> => {
    const inv = await apiFetch<BackendInventory[]>("/inventory");
    return inv
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(mapInventory);
  },
  create: async (payload: InventoryPayload) => {
    await apiFetch<unknown>("/inventory", {
      method: "POST",
      body: JSON.stringify(inventoryBody(payload)),
    });
  },
  update: async (id: string, payload: InventoryPayload) => {
    await apiFetch<unknown>(`/inventory/${id}`, {
      method: "PUT",
      body: JSON.stringify(inventoryBody(payload)),
    });
  },
  remove: async (id: string) => {
    await apiFetch<unknown>(`/inventory/${id}`, { method: "DELETE" });
  },
  wastage: async (inventoryId: string, quantity: number, reason: string) => {
    await apiFetch<unknown>("/inventory/wastage", {
      method: "POST",
      body: JSON.stringify({
        inventory_id: inventoryId,
        quantity,
        reason,
      }),
    });
  },
  /** Waste a finished menu item; deducts all recipe ingredients automatically. */
  productWastage: async (payload: {
    productId: string;
    productSizeId?: string;
    quantity: number;
    reason: string;
  }) => {
    return apiFetch<{
      product_name: string;
      quantity: number;
      lines: {
        inventory_id: string;
        inventory_name: string;
        unit: string;
        quantity_base: number;
      }[];
    }>("/inventory/wastage/product", {
      method: "POST",
      body: JSON.stringify({
        product_id: payload.productId,
        product_size_id: payload.productSizeId || undefined,
        quantity: payload.quantity,
        reason: payload.reason,
      }),
    });
  },
  adjust: async (inventoryId: string, quantity: number, reason: string) => {
    await apiFetch<unknown>("/inventory/adjust", {
      method: "POST",
      body: JSON.stringify({
        inventory_id: inventoryId,
        quantity,
        reason,
      }),
    });
  },
  /** Save many rows: min stock / unit + optional today buy (stock + weighted avg). Not an expense. */
  bulkSave: async (
    items: {
      inventoryId: string;
      minimumStock?: number;
      purchaseUnit?: string;
      unitsPerPurchase?: number;
      buyQty?: number;
      buyCost?: number;
    }[],
  ) => {
    await apiFetch<unknown>("/inventory/bulk-save", {
      method: "POST",
      body: JSON.stringify({
        items: items.map((i) => ({
          inventory_id: i.inventoryId,
          minimum_stock: i.minimumStock,
          purchase_unit: i.purchaseUnit,
          units_per_purchase: i.unitsPerPurchase,
          buy_qty: Number(i.buyQty || 0),
          buy_cost: Number(i.buyCost || 0),
        })),
      }),
    });
  },
  alerts: () =>
    apiFetch<{
      out_of_stock: BackendInventory[];
      low_stock: BackendInventory[];
      negative_stock: BackendInventory[];
      never_purchased: BackendInventory[];
      never_used: BackendInventory[];
      stock_value: number;
    }>("/inventory/alerts"),
  recommendations: () =>
    apiFetch<
      {
        inventory_id: string;
        name: string;
        category: string;
        unit: string;
        purchase_unit: string;
        current_stock: number;
        minimum_stock: number;
        avg_daily_usage: number;
        days_remaining: number;
        suggested_qty_base: number;
        suggested_qty_purchase: number;
        estimated_cost: number;
        urgency: string;
        reason: string;
      }[]
    >("/inventory/recommendations"),
};

export const inventoryTransactionsApi = {
  list: async (inventoryId?: string, type?: string) => {
    const params = new URLSearchParams();
    if (inventoryId) params.set("inventory_id", inventoryId);
    if (type) params.set("type", type);
    const qs = params.toString() ? `?${params}` : "";
    return apiFetch<BackendInventoryTransaction[]>(`/inventory/transactions${qs}`);
  },
};

export const recipesApi = {
  list: () => apiFetch<BackendRecipe[]>("/recipes"),
  listByProduct: (productId: string) =>
    apiFetch<BackendRecipe[]>(`/recipes/product/${productId}`),
  create: (payload: {
    product_id: string;
    inventory_id: string;
    quantity_required: number;
    product_size_id?: string | null;
  }) =>
    apiFetch<BackendRecipe>("/recipes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (
    id: string,
    payload: {
      inventory_id?: string;
      quantity_required?: number;
      product_size_id?: string | null;
    },
  ) =>
    apiFetch<null>(`/recipes/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: string) =>
    apiFetch<null>(`/recipes/${id}`, { method: "DELETE" }),
  replaceSet: (payload: {
    product_id: string;
    product_size_id?: string | null;
    lines: { inventory_id: string; quantity_required: number }[];
  }) =>
    apiFetch<BackendRecipe[]>("/recipes/set", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
};

const COST_SCALE = 1_000_000;

export const suppliersApi = {
  list: async (): Promise<Supplier[]> => {
    const rows = await apiFetch<
      {
        id: string;
        name: string;
        phone: string;
        email: string;
        address: string;
        contact_name: string;
        notes: string;
        is_active: boolean;
      }[]
    >("/suppliers");
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
      contactName: s.contact_name || "",
      notes: s.notes || "",
      isActive: s.is_active !== false,
    }));
  },
  create: async (payload: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    contactName?: string;
    notes?: string;
  }) => {
    await apiFetch("/suppliers", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        phone: payload.phone || "",
        email: payload.email || "",
        address: payload.address || "",
        contact_name: payload.contactName || "",
        notes: payload.notes || "",
      }),
    });
  },
  update: async (
    id: string,
    payload: {
      name: string;
      phone?: string;
      email?: string;
      address?: string;
      contactName?: string;
      notes?: string;
      isActive?: boolean;
    },
  ) => {
    await apiFetch(`/suppliers/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: payload.name,
        phone: payload.phone || "",
        email: payload.email || "",
        address: payload.address || "",
        contact_name: payload.contactName || "",
        notes: payload.notes || "",
        is_active: payload.isActive,
      }),
    });
  },
  remove: (id: string) =>
    apiFetch(`/suppliers/${id}`, { method: "DELETE" }),
};

type BackendPurchase = {
  id: string;
  invoice_number: string;
  supplier_id?: string;
  supplier_name: string;
  purchase_date: string;
  subtotal: number;
  discount: number;
  other_cost: number;
  grand_total: number;
  payment_method: string;
  amount_paid: number;
  status: string;
  notes: string;
  items?: {
    id: string;
    inventory_id: string;
    purchase_unit: string;
    quantity_micros: number;
    quantity_base: number;
    unit_price: number;
    line_total: number;
    inventory?: { name: string };
  }[];
};

function mapPurchase(p: BackendPurchase): Purchase {
  return {
    id: p.id,
    invoiceNumber: p.invoice_number || "",
    supplierId: p.supplier_id,
    supplierName: p.supplier_name || "",
    purchaseDate: (p.purchase_date || "").slice(0, 10),
    subtotal: Number(p.subtotal || 0),
    discount: Number(p.discount || 0),
    otherCost: Number(p.other_cost || 0),
    grandTotal: Number(p.grand_total || 0),
    paymentMethod: p.payment_method || "cash",
    amountPaid: Number(p.amount_paid || 0),
    status: p.status,
    notes: p.notes || "",
    items: (p.items || []).map((i) => ({
      id: i.id,
      inventoryId: i.inventory_id,
      inventoryName: i.inventory?.name,
      purchaseUnit: i.purchase_unit,
      quantity: Number(i.quantity_micros || 0) / COST_SCALE,
      unitPrice: Number(i.unit_price || 0),
      lineTotal: Number(i.line_total || 0),
      quantityBase: Number(i.quantity_base || 0),
    })),
  };
}

export const purchasesApi = {
  list: async (): Promise<Purchase[]> => {
    const rows = await apiFetch<BackendPurchase[]>("/purchases");
    return rows.map(mapPurchase);
  },
  get: async (id: string) => mapPurchase(await apiFetch<BackendPurchase>(`/purchases/${id}`)),
  create: async (payload: {
    invoiceNumber: string;
    supplierId?: string;
    supplierName?: string;
    purchaseDate: string;
    discount?: number;
    otherCost?: number;
    paymentMethod?: string;
    amountPaid?: number;
    notes?: string;
    items: {
      inventoryId: string;
      purchaseUnit: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }[];
  }) => {
    const body = {
      invoice_number: payload.invoiceNumber,
      supplier_id: payload.supplierId || null,
      supplier_name: payload.supplierName || "",
      purchase_date: new Date(payload.purchaseDate).toISOString(),
      discount: Number(payload.discount || 0),
      other_cost: Number(payload.otherCost || 0),
      payment_method: payload.paymentMethod || "cash",
      amount_paid: Number(payload.amountPaid || 0),
      notes: payload.notes || "",
      items: payload.items.map((i) => ({
        inventory_id: i.inventoryId,
        purchase_unit: i.purchaseUnit,
        quantity_micros: Math.round(Number(i.quantity || 0) * COST_SCALE),
        unit_price: Number(i.unitPrice || 0),
        line_total: Number(i.lineTotal || 0),
      })),
    };
    return mapPurchase(
      await apiFetch<BackendPurchase>("/purchases", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  },
  update: async (
    id: string,
    payload: {
      invoiceNumber: string;
      supplierId?: string;
      supplierName?: string;
      purchaseDate: string;
      discount?: number;
      otherCost?: number;
      paymentMethod?: string;
      amountPaid?: number;
      notes?: string;
      items: {
        inventoryId: string;
        purchaseUnit: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
      }[];
    },
  ) => {
    const body = {
      invoice_number: payload.invoiceNumber,
      supplier_id: payload.supplierId || null,
      supplier_name: payload.supplierName || "",
      purchase_date: new Date(payload.purchaseDate).toISOString(),
      discount: Number(payload.discount || 0),
      other_cost: Number(payload.otherCost || 0),
      payment_method: payload.paymentMethod || "cash",
      amount_paid: Number(payload.amountPaid || 0),
      notes: payload.notes || "",
      items: payload.items.map((i) => ({
        inventory_id: i.inventoryId,
        purchase_unit: i.purchaseUnit,
        quantity_micros: Math.round(Number(i.quantity || 0) * COST_SCALE),
        unit_price: Number(i.unitPrice || 0),
        line_total: Number(i.lineTotal || 0),
      })),
    };
    return mapPurchase(
      await apiFetch<BackendPurchase>(`/purchases/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    );
  },
  reverse: (id: string) =>
    apiFetch(`/purchases/${id}/reverse`, { method: "PATCH" }),
};

export const expensesApi = {
  categories: () => apiFetch<string[]>("/expenses/categories"),
  list: async (params?: { limit?: number; offset?: number }): Promise<Expense[]> => {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : "";

    if (params?.limit != null) {
      const page = await apiFetch<{
        items: {
          id: string;
          category: string;
          title: string;
          amount: number;
          expense_date: string;
          payment_method: string;
          notes: string;
          receipt_image: string;
          recurrence: string;
        }[];
        total: number;
        limit: number;
        offset: number;
      }>(`/expenses${suffix}`);
      return (page.items || []).map((e) => ({
        id: e.id,
        category: e.category,
        title: e.title || "",
        amount: Number(e.amount || 0),
        expenseDate: (e.expense_date || "").slice(0, 10),
        paymentMethod: e.payment_method || "cash",
        notes: e.notes || "",
        receiptImage: e.receipt_image || "",
        recurrence: e.recurrence || "NONE",
      }));
    }

    const rows = await apiFetch<
      {
        id: string;
        category: string;
        title: string;
        amount: number;
        expense_date: string;
        payment_method: string;
        notes: string;
        receipt_image: string;
        recurrence: string;
      }[]
    >(`/expenses${suffix}`);
    return rows.map((e) => ({
      id: e.id,
      category: e.category,
      title: e.title || "",
      amount: Number(e.amount || 0),
      expenseDate: (e.expense_date || "").slice(0, 10),
      paymentMethod: e.payment_method || "cash",
      notes: e.notes || "",
      receiptImage: e.receipt_image || "",
      recurrence: e.recurrence || "NONE",
    }));
  },
  create: async (payload: {
    category: string;
    title?: string;
    amount: number;
    expenseDate: string;
    paymentMethod?: string;
    notes?: string;
    recurrence?: string;
  }) => {
    await apiFetch("/expenses", {
      method: "POST",
      body: JSON.stringify({
        category: payload.category,
        title: payload.title || "",
        amount: Number(payload.amount || 0),
        expense_date: new Date(payload.expenseDate).toISOString(),
        payment_method: payload.paymentMethod || "cash",
        notes: payload.notes || "",
        recurrence: payload.recurrence || "NONE",
      }),
    });
  },
  update: async (
    id: string,
    payload: {
      category: string;
      title?: string;
      amount: number;
      expenseDate: string;
      paymentMethod?: string;
      notes?: string;
      recurrence?: string;
    },
  ) => {
    await apiFetch(`/expenses/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        category: payload.category,
        title: payload.title || "",
        amount: Number(payload.amount || 0),
        expense_date: new Date(payload.expenseDate).toISOString(),
        payment_method: payload.paymentMethod || "cash",
        notes: payload.notes || "",
        recurrence: payload.recurrence || "NONE",
      }),
    });
  },
  remove: (id: string) =>
    apiFetch(`/expenses/${id}`, { method: "DELETE" }),
};

export type ProfitLossReport = {
  start: string;
  end: string;
  revenue: number;
  completed_orders: number;
  cancelled_orders: number;
  cogs: number;
  gross_profit: number;
  expenses: number;
  wastage_cost: number;
  net_profit: number;
  food_cost_percent: number;
  inventory_value: number;
  purchases_spend: number;
  food_cost_source?: string;
  period_days?: number;
  elapsed_days?: number;
  period_complete?: boolean;
  avg_daily_revenue?: number;
  avg_daily_expenses?: number;
  avg_daily_profit?: number;
  best_selling: {
    product_id: string;
    product_name: string;
    quantity: number;
    revenue: number;
    cost: number;
    profit: number;
    margin_pct: number;
  }[];
  least_selling: {
    product_id: string;
    product_name: string;
    quantity: number;
    revenue: number;
    cost: number;
    profit: number;
    margin_pct: number;
  }[];
  most_profitable: {
    product_id: string;
    product_name: string;
    quantity: number;
    revenue: number;
    cost: number;
    profit: number;
    margin_pct: number;
  }[];
  least_profitable: {
    product_id: string;
    product_name: string;
    quantity: number;
    revenue: number;
    cost: number;
    profit: number;
    margin_pct: number;
  }[];
  expense_breakdown: { category: string; total: number }[];
};

export const reportsApi = {
  profitLoss: (params?: { range?: string; start?: string; end?: string }) => {
    const q = new URLSearchParams();
    if (params?.range) q.set("range", params.range);
    if (params?.start) q.set("start", params.start);
    if (params?.end) q.set("end", params.end);
    const qs = q.toString() ? `?${q}` : "";
    return apiFetch<ProfitLossReport>(`/reports/profit-loss${qs}`);
  },
};

export const ordersApi = {
  list: (params?: { limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set("limit", String(params.limit));
    if (params?.offset != null) search.set("offset", String(params.offset));
    const qs = search.toString();
    return apiFetch<BackendOrder[]>(`/orders${qs ? `?${qs}` : "?limit=200"}`);
  },
  /** Paginated admin browse — requires include_total on the API. */
  listPage: (params?: {
    limit?: number;
    offset?: number;
    status?: string;
    q?: string;
    start?: string;
    end?: string;
  }) => {
    const search = new URLSearchParams();
    search.set("include_total", "1");
    search.set("limit", String(params?.limit ?? 50));
    if (params?.offset != null) search.set("offset", String(params.offset));
    if (params?.status && params.status !== "ALL") {
      search.set("status", params.status);
    }
    if (params?.q?.trim()) search.set("q", params.q.trim());
    if (params?.start) search.set("start", params.start);
    if (params?.end) search.set("end", params.end);
    return apiFetch<{
      items: BackendOrder[];
      total: number;
      limit: number;
      offset: number;
    }>(`/orders?${search}`);
  },
  pending: () => apiFetch<BackendOrder[]>("/orders/pending"),
  update: (
    id: string,
    updates: { customer_name?: string; phone?: string },
  ) =>
    apiFetch<null>(`/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  complete: (id: string) =>
    apiFetch<null>(`/orders/${id}/complete`, { method: "PATCH" }),
  cancel: (id: string) =>
    apiFetch<null>(`/orders/${id}/cancel`, { method: "PATCH" }),
};

