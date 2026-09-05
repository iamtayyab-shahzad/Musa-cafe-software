import { apiFetch, ApiError } from "@/lib/api-client";
import {
  listLocalInventory,
  listLocalProducts,
  listLocalOrders,
  replaceProducts,
  replaceCategories,
  replaceInventory,
  saveLocalSettings,
  upsertLocalOrder,
  getLocalSettings,
  findPendingCreateByClientId,
  cacheGet,
  cacheSet,
  resolveServerOrderId,
} from "@/lib/offline-db";
import { isNetworkError, isOnline, isQueueableError } from "@/lib/network";
import {
  notifyCacheUpdated,
  notifyOrdersChanged,
} from "@/lib/offline-events";
import { ordersShareIdentity } from "@/lib/order-identity";
import {
  enqueueAndTrack,
  runSync,
  startSyncEngine,
  subscribeSync,
  getSyncState,
  refreshPendingCount,
  POS_SYNC_COMPLETE_EVENT,
} from "@/lib/sync-engine";
import { calcCodFee, calcGrandTotal, recomputeOrderMoney } from "@/lib/utils";
import { weekendDiscount } from "@/lib/discount-rules";
import {
  karachiYmd,
  localMonthlySales,
  localSalesForKarachiDay,
  localWeeklySales,
  localYesterdaySales,
} from "@/lib/local-sales";
import { isDealProduct } from "@/lib/deal-flavors";
import {
  catalogRepo,
  customersRepo,
  inventoryRepo,
  locationsRepo,
  ordersRepo,
  sessionRepo,
  settingsRepo,
  warmOfflineCache,
} from "@/lib/repos";
import {
  krunchiesCategories,
  krunchiesOffers,
  krunchiesProducts,
} from "@/data/krunchies";
import type {
  Category,
  CreateOrderInput,
  InventoryItem,
  InventoryTransaction,
  Location,
  Offer,
  Order,
  OrderItem,
  PaymentMethod,
  Product,
  ProductSize,
  Recipe,
  Settings,
  StaffLoginInput,
} from "@/types";

export {
  catalogRepo,
  customersRepo,
  inventoryRepo,
  locationsRepo,
  ordersRepo,
  sessionRepo,
  settingsRepo,
  warmOfflineCache,
  startSyncEngine,
  subscribeSync,
  getSyncState,
  refreshPendingCount,
  runSync,
  POS_SYNC_COMPLETE_EVENT,
};

export const authApi = {
  login: async (input: StaffLoginInput) => {
    const attempt = () =>
      apiFetch<{ token: string }>(
        "/auth/staff/login",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
        false,
        {
          // Never block login on the POS circuit breaker / false offline flag.
          bypassCircuitBreaker: true,
          // Shop Wi‑Fi is slow — give login a real chance.
          timeoutMs: 30_000,
          // Failed attempt must not lock the next Sign In behind a 45s–3min cooldown.
          softFail: true,
        },
      );

    try {
      const data = await attempt();
      await sessionRepo.cacheFromToken(input.username, data.token);
      return data;
    } catch (err) {
      // One automatic retry after a brief pause (cold API / flaky Wi‑Fi).
      const msg = err instanceof Error ? err.message : "";
      if (!/timed out|unavailable|network/i.test(msg)) throw err;
      await new Promise((r) => setTimeout(r, 700));
      const data = await attempt();
      await sessionRepo.cacheFromToken(input.username, data.token);
      return data;
    }
  },
};

export async function syncKrunchiesMenu() {
  const [remoteCategories, remoteProducts, remoteSizes, remoteOffers] =
    await Promise.all([
      apiFetch<Category[]>("/categories"),
      apiFetch<Product[]>("/products"),
      apiFetch<ProductSize[]>("/product-sizes"),
      apiFetch<Offer[]>("/offers"),
    ]);
  const categoryIds = new Set(remoteCategories.map((item) => item.id));
  const productIds = new Set(remoteProducts.map((item) => item.id));
  const sizesById = new Map(remoteSizes.map((item) => [item.id, item]));
  const offerIds = new Set(remoteOffers.map((item) => item.id));

  const shouldSeedCatalog =
    remoteCategories.length === 0 ||
    remoteProducts.length === 0 ||
    remoteSizes.length === 0;
  const shouldSeedOffers = remoteOffers.length === 0;

  if (shouldSeedCatalog) {
    await Promise.all(
      krunchiesCategories.map((category) => {
        if (categoryIds.has(category.id)) return Promise.resolve(null);
        return apiFetch<Category>("/categories", {
          method: "POST",
          body: JSON.stringify({
            id: category.id,
            name: category.name,
            image: category.image,
            display_order: category.display_order,
            visible: category.visible,
          }),
        });
      }),
    );

    await Promise.all(
      krunchiesProducts.map((product) => {
        if (productIds.has(product.id)) return Promise.resolve(null);
        return apiFetch<Product>("/products", {
          method: "POST",
          body: JSON.stringify({
            id: product.id,
            category_id: product.category_id,
            name: product.name,
            description: product.description,
            image: product.image,
            featured: product.featured,
            available: product.available,
            display_order: product.display_order,
          }),
        });
      }),
    );

    await Promise.all(
      krunchiesProducts.flatMap((product) =>
        (product.sizes ?? []).map((size) => {
          if (sizesById.has(size.id)) return Promise.resolve(null);
          return apiFetch<ProductSize>("/product-sizes", {
            method: "POST",
            body: JSON.stringify({
              id: size.id,
              product_id: size.product_id,
              size: size.size,
              price: size.price,
            }),
          });
        }),
      ),
    );
  }

  if (shouldSeedOffers) {
    await Promise.all(
      krunchiesOffers.map((offer) => {
        if (offerIds.has(offer.id)) return Promise.resolve(null);
        const isPromotion = Boolean(offer.start_date || offer.end_date);
        return apiFetch<Offer>("/offers", {
          method: "POST",
          body: JSON.stringify({
            id: offer.id,
            title: offer.title,
            description: offer.description,
            image: offer.image,
            active: offer.active,
            start_date: offer.start_date,
            end_date: offer.end_date,
            offer_popup: isPromotion,
            homepage_deal: true,
            discount_label: offer.title,
          }),
        });
      }),
    );
  }

  await Promise.all([
    catalogRepo.listCategories(),
    catalogRepo.listProducts(),
    settingsRepo.get(),
    locationsRepo.list(),
    inventoryRepo.list(),
  ]);
}

function offlineOkMessage(action: string) {
  return `${action} saved offline — will sync when online`;
}

export const productsApi = {
  list: () => catalogRepo.listProducts(),
  get: async (id: string) => {
    const products = await catalogRepo.listProducts();
    const product = products.find((item) => item.id === id);
    if (!product) throw new Error("Product not found");
    return product;
  },

  /**
   * Admin-parity create: product + sizes in one call.
   * Offline: stores locally with client UUIDs and queues idempotent sync.
   */
  saveWithSizes: async (input: {
    id?: string;
    category_id: string;
    name: string;
    description: string;
    image: string;
    featured: boolean;
    available: boolean;
    display_order?: number;
    sizes: { id?: string; label: string; price: number }[];
  }) => {
    const productId = input.id || crypto.randomUUID();
    const sizes: ProductSize[] = (input.sizes || [])
      .filter((s) => s.label.trim())
      .map((s) => ({
        id: s.id || crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        product_id: productId,
        size: s.label.trim(),
        price: Number(s.price) || 0,
      }));

    const productBody = {
      id: productId,
      category_id: input.category_id,
      name: input.name.trim(),
      description: input.description || "",
      image: input.image || "",
      featured: input.featured,
      available: input.available,
      display_order: input.display_order || 0,
    };

    const applyLocal = async () => {
      const local: Product = {
        ...productBody,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sizes,
      };
      const products = await listLocalProducts();
      await replaceProducts([
        local,
        ...products.filter((p) => p.id !== local.id),
      ]);
      return local;
    };

    const keptForHistory: string[] = [];
    try {
      if (!isOnline()) throw new ApiError("Network unavailable", 0);

      if (input.id) {
        await apiFetch<null>(`/products/${productId}`, {
          method: "PUT",
          body: JSON.stringify({
            category_id: productBody.category_id,
            name: productBody.name,
            description: productBody.description,
            image: productBody.image,
            featured: productBody.featured,
            available: productBody.available,
            display_order: productBody.display_order,
          }),
        });
        const allSizes = await apiFetch<ProductSize[]>("/product-sizes");
        const existing = allSizes.filter((s) => s.product_id === productId);
        const desired = new Set(sizes.map((s) => s.size.toLowerCase()));
        for (const e of existing) {
          if (!desired.has(e.size.toLowerCase())) {
            try {
              await apiFetch(`/product-sizes/${e.id}`, { method: "DELETE" });
            } catch (err) {
              // Old tickets may still reference this size (409, or 500 on older API).
              // Keep the row for history and still save the other sizes.
              if (
                err instanceof ApiError &&
                (err.status === 409 || err.status === 500)
              ) {
                keptForHistory.push(e.size);
                continue;
              }
              throw err;
            }
          }
        }
        for (const s of sizes) {
          const match = existing.find(
            (e) => e.size.toLowerCase() === s.size.toLowerCase(),
          );
          if (match) {
            const price = Math.round(s.price);
            if (
              match.size !== s.size ||
              Number(match.price) !== price
            ) {
              await apiFetch(`/product-sizes/${match.id}`, {
                method: "PUT",
                body: JSON.stringify({ size: s.size, price }),
              });
            }
          } else {
            await apiFetch("/product-sizes", {
              method: "POST",
              body: JSON.stringify({
                id: s.id,
                product_id: productId,
                size: s.size,
                price: Math.round(s.price),
              }),
            });
          }
        }
      } else {
        await apiFetch<Product>("/products", {
          method: "POST",
          body: JSON.stringify(productBody),
        });
        for (const s of sizes) {
          await apiFetch("/product-sizes", {
            method: "POST",
            body: JSON.stringify({
              id: s.id,
              product_id: productId,
              size: s.size,
              price: s.price,
            }),
          });
        }
      }

      await applyLocal();
      let saved: Product | undefined;
      try {
        const refreshed = await catalogRepo.refreshProducts();
        saved = refreshed.find((p) => p.id === productId);
      } catch {
        /* local copy already written */
      }
      return {
        data: saved || (await applyLocal()),
        offline: false as const,
        keptSizes: keptForHistory,
      };
    } catch (e) {
      if (!isQueueableError(e) && isOnline()) throw e;
      const local = await applyLocal();
      await enqueueAndTrack({
        type: input.id ? "UPDATE_PRODUCT" : "CREATE_PRODUCT",
        payload: {
          id: productId,
          product: productBody,
          sizes: sizes.map((s) => ({
            id: s.id,
            size: s.size,
            price: s.price,
          })),
        },
      });
      return {
        data: local,
        offline: true as const,
        keptSizes: keptForHistory,
        message: offlineOkMessage(
          input.id ? "Product update" : "Product",
        ),
      };
    }
  },

  create: async (payload: Partial<Product>) => {
    return productsApi.saveWithSizes({
      category_id: payload.category_id || "",
      name: payload.name || "",
      description: payload.description || "",
      image: payload.image || "",
      featured: Boolean(payload.featured),
      available: payload.available !== false,
      display_order: payload.display_order || 0,
      sizes: (payload.sizes || []).map((s) => ({
        id: s.id,
        label: s.size,
        price: s.price,
      })),
    });
  },
  update: async (id: string, updates: Record<string, unknown>) => {
    const current = await productsApi.get(id).catch(() => null);
    const sizes =
      (updates.sizes as ProductSize[] | undefined) || current?.sizes || [];
    return productsApi.saveWithSizes({
      id,
      category_id: String(updates.category_id || current?.category_id || ""),
      name: String(updates.name || current?.name || ""),
      description: String(updates.description ?? current?.description ?? ""),
      image: String(updates.image ?? current?.image ?? ""),
      featured: Boolean(
        updates.featured !== undefined ? updates.featured : current?.featured,
      ),
      available: Boolean(
        updates.available !== undefined
          ? updates.available
          : current?.available !== false,
      ),
      display_order: Number(
        updates.display_order ?? current?.display_order ?? 0,
      ),
      sizes: sizes.map((s) => ({
        id: s.id,
        label: s.size,
        price: s.price,
      })),
    });
  },
  remove: (id: string) =>
    apiFetch<null>(`/products/${id}`, { method: "DELETE" }),
};

export const productSizesApi = {
  list: async () => {
    const products = await catalogRepo.listProducts();
    return products.flatMap((p) => p.sizes || []);
  },
  create: (payload: Partial<ProductSize>) =>
    apiFetch<ProductSize>("/product-sizes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, updates: Record<string, unknown>) =>
    apiFetch<null>(`/product-sizes/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  remove: (id: string) =>
    apiFetch<null>(`/product-sizes/${id}`, { method: "DELETE" }),
};

export const categoriesApi = {
  list: () => catalogRepo.listCategories(),
  create: async (payload: Partial<Category>) => {
    try {
      if (!isOnline()) throw new ApiError("Network unavailable", 0);
      const created = await apiFetch<Category>("/categories", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await catalogRepo.listCategories();
      return { data: created, offline: false as const };
    } catch (e) {
      if (!isNetworkError(e) && isOnline()) throw e;
      const local: Category = {
        id: payload.id || crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        name: payload.name || "Category",
        image: payload.image || "",
        display_order: payload.display_order || 0,
        visible: payload.visible !== false,
      };
      const cats = await catalogRepo.listCategories();
      await replaceCategories([local, ...cats.filter((c) => c.id !== local.id)]);
      await enqueueAndTrack({
        type: "CREATE_CATEGORY",
        payload: { ...payload, id: local.id },
      });
      return {
        data: local,
        offline: true as const,
        message: offlineOkMessage("Category"),
      };
    }
  },
  update: async (id: string, updates: Record<string, unknown>) => {
    try {
      if (!isOnline()) throw new ApiError("Network unavailable", 0);
      await apiFetch<null>(`/categories/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      await catalogRepo.listCategories();
      return { offline: false as const };
    } catch (e) {
      if (!isNetworkError(e) && isOnline()) throw e;
      const cats = await catalogRepo.listCategories();
      await replaceCategories(
        cats.map((c) =>
          c.id === id
            ? ({ ...c, ...updates, updated_at: new Date().toISOString() } as Category)
            : c,
        ),
      );
      await enqueueAndTrack({ type: "UPDATE_CATEGORY", payload: { id, updates } });
      return {
        offline: true as const,
        message: offlineOkMessage("Category update"),
      };
    }
  },
  remove: (id: string) =>
    apiFetch<null>(`/categories/${id}`, { method: "DELETE" }),
};

export const locationsApi = {
  list: () => locationsRepo.list(),
  create: (payload: Partial<Location>) =>
    apiFetch<Location>("/locations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, updates: Record<string, unknown>) =>
    apiFetch<null>(`/locations/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  remove: (id: string) =>
    apiFetch<null>(`/locations/${id}`, { method: "DELETE" }),
};

async function resolveLineDetails(
  item: CreateOrderInput["items"][number],
  products: Product[],
): Promise<{ price: number; product?: Product; size?: ProductSize }> {
  const product = products.find((p) => p.id === item.product_id);
  const size = product?.sizes?.find((s) => s.id === item.product_size_id);
  const price =
    typeof item.price === "number" && item.price > 0
      ? item.price
      : (size?.price ?? 0);
  return { price, product, size };
}

async function buildLocalOrder(
  input: CreateOrderInput,
  orderType: string,
  clientOrderId: string,
  opts?: { orderStatus?: "PENDING" | "COMPLETED" },
): Promise<Order> {
  const id = clientOrderId;
  const now = new Date().toISOString();
  const products = await listLocalProducts();
  const items: OrderItem[] = await Promise.all(
    input.items.map(async (item) => {
      const { price, product, size } = await resolveLineDetails(item, products);
      return {
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
        order_id: id,
        product_id: item.product_id,
        product_size_id: item.product_size_id,
        quantity: item.quantity,
        price,
        special_instructions: item.special_instructions,
        product,
        product_size: size,
        product_name: product?.name || "Item",
        size: size?.size || "-",
        product_description: product?.description || "",
      } as OrderItem;
    }),
  );
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discount = weekendDiscount(
    items.map((i) => ({
      product_name: i.product_name || i.product?.name,
      price: i.price,
      quantity: i.quantity,
      is_deal: i.product ? isDealProduct(i.product) : undefined,
    })),
  );
  const locations =
    (await cacheGet<Location[]>("locations")) ||
    (await locationsRepo.list().catch(() => []));
  const location = locations.find((l) => l.id === input.location_id);
  const delivery_charge =
    orderType === "walkin" ? 0 : location?.delivery_charge || 0;
  const settings = (await getLocalSettings()) || (await settingsRepo.get());
  const cash_on_delivery_fee = calcCodFee(
    input.payment_method as PaymentMethod,
    settings.cash_on_delivery_fee || 0,
  );
  const grand_total = calcGrandTotal(
    subtotal,
    delivery_charge,
    cash_on_delivery_fee,
    discount,
  );
  const { allocateNextDailyNumber, uniqueOrderCode } = await import(
    "@/lib/daily-order-number"
  );
  const { shop } = await import("@/lib/shop");
  let business_date = (input.business_date || "").trim();
  let daily_number = Number(input.daily_number) || 0;
  if (!(daily_number > 0) || !business_date) {
    const allocated = await allocateNextDailyNumber(
      input.created_at ? new Date(input.created_at) : new Date(),
    );
    business_date = allocated.businessDate;
    daily_number = allocated.dailyNumber;
  }
  const created_at = input.created_at || now;
  return {
    id,
    created_at,
    updated_at: now,
    order_number: uniqueOrderCode(
      shop.orderPrefix || "MC",
      business_date,
      daily_number,
    ),
    business_date,
    daily_number,
    client_order_id: id,
    customer_name: input.customer_name,
    phone: input.phone,
    address: input.address || "",
    location_id: input.location_id,
    delivery_charge,
    cash_on_delivery_fee,
    payment_method: input.payment_method,
    order_status: opts?.orderStatus === "COMPLETED" ? "COMPLETED" : "PENDING",
    order_type: orderType,
    order_notes: input.order_notes || "",
    subtotal,
    discount,
    grand_total,
    items,
    sync_status: "pending_sync",
  };
}

async function markLocalOrderStatus(
  id: string,
  order_status: "PENDING" | "COMPLETED" | "CANCELLED",
  opts?: { pendingSync?: boolean },
) {
  try {
    // Always read from IndexedDB — never hit the network for status marks.
    // Update every local row that shares this ticket identity (client UUID
    // and/or mapped server UUID) so pending polls cannot resurrect a twin.
    const locals = await listLocalOrders();
    const serverId = await resolveServerOrderId(id);
    const matches = locals.filter(
      (o) =>
        o.id === id ||
        o.id === serverId ||
        o.client_order_id === id ||
        ordersShareIdentity(o, { id, client_order_id: id }),
    );
    if (!matches.length) return;

    const now = new Date().toISOString();
    for (const order of matches) {
      await upsertLocalOrder({
        ...order,
        order_status,
        updated_at: now,
        ...(opts?.pendingSync ? { sync_status: "pending_sync" } : {}),
      });
    }
  } catch {
    // ignore
  } finally {
    notifyOrdersChanged();
  }
}

export const ordersApi = {
  list: () => ordersRepo.list(),
  pending: () => ordersRepo.pending(),
  get: (id: string) => ordersRepo.get(id),
  /**
   * Local-first: always write IndexedDB + queue immediately.
   * Sync engine pushes to the server in the background — never wait on network.
   */
  create: async (
    input: CreateOrderInput,
    orderType: "walkin" | "phone" | "website" = "walkin",
    opts?: { completeImmediately?: boolean },
  ) => {
    const clientOrderId = input.client_order_id || crypto.randomUUID();
    const apiInput: CreateOrderInput = {
      ...input,
      client_order_id: clientOrderId,
      items: input.items.map(
        ({ product_id, product_size_id, quantity, price, special_instructions }) => ({
          product_id,
          product_size_id,
          quantity,
          ...(typeof price === "number" && price > 0 ? { price } : {}),
          special_instructions,
        }),
      ),
    };

    const existing = await findPendingCreateByClientId(clientOrderId);
    if (existing) {
      const local = (await listLocalOrders()).find((o) => o.id === clientOrderId);
      if (local) return local;
    }

    const local = await buildLocalOrder(input, orderType, clientOrderId, {
      orderStatus: opts?.completeImmediately ? "COMPLETED" : "PENDING",
    });
    const queuedInput: CreateOrderInput = {
      ...apiInput,
      created_at: local.created_at,
      daily_number: local.daily_number,
      business_date: local.business_date,
    };
    if (!existing) {
      await enqueueAndTrack({
        type: "CREATE_ORDER",
        payload: { input: queuedInput, orderType, localId: local.id },
      });
    }
    await upsertLocalOrder(local);
    notifyOrdersChanged();
    return local;
  },
  update: async (id: string, updates: Record<string, unknown>) => {
    try {
      const existing =
        (await listLocalOrders()).find((o) => o.id === id) ||
        (await ordersRepo.get(id).catch(() => null));
      if (existing) {
        const { items: rawItems, ...rest } = updates;
        let merged: Order = {
          ...existing,
          ...rest,
          id,
          updated_at: new Date().toISOString(),
          sync_status: "pending_sync",
        } as Order;

        if (Array.isArray(rawItems)) {
          const products = await listLocalProducts();
          const now = new Date().toISOString();
          const items: OrderItem[] = await Promise.all(
            (rawItems as CreateOrderInput["items"]).map(async (item, index) => {
              const { price, product, size } = await resolveLineDetails(
                item,
                products,
              );
              const linePrice =
                typeof (item as { price?: number }).price === "number"
                  ? Number((item as { price?: number }).price)
                  : price;
              return {
                id: `${id}-line-${index}`,
                created_at: now,
                updated_at: now,
                order_id: id,
                product_id: item.product_id,
                product_size_id: item.product_size_id,
                quantity: item.quantity,
                price: linePrice,
                special_instructions: item.special_instructions,
                product,
                product_size: size,
                product_name: product?.name || "Item",
                size: size?.size || "-",
              } as OrderItem;
            }),
          );
          merged = { ...merged, items };
        }

        merged = recomputeOrderMoney(merged);
        await upsertLocalOrder(merged);

        // Keep queued payload money in sync with local (backend also recalculates).
        updates = {
          ...updates,
          subtotal: merged.subtotal,
          discount: merged.discount,
          grand_total: merged.grand_total,
          delivery_charge: merged.delivery_charge,
          cash_on_delivery_fee: merged.cash_on_delivery_fee,
        };
      }
    } catch {
      /* ignore */
    }
    await enqueueAndTrack({
      type: "UPDATE_ORDER",
      payload: { id, updates },
    });
    notifyOrdersChanged();
    return {
      offline: true as const,
      message: offlineOkMessage("Order update"),
    };
  },
  complete: async (id: string) => {
    const { listPendingActions } = await import("@/lib/offline-db");
    const alreadyQueued = (await listPendingActions()).some(
      (a) =>
        a.type === "COMPLETE_ORDER" &&
        (a.payload as { id?: string }).id === id,
    );
    if (!alreadyQueued) {
      await enqueueAndTrack({ type: "COMPLETE_ORDER", payload: { id } });
    }
    await markLocalOrderStatus(id, "COMPLETED", { pendingSync: true });
    return {
      offline: true as const,
      message: offlineOkMessage("Order completed"),
    };
  },
  cancel: async (id: string) => {
    await enqueueAndTrack({ type: "CANCEL_ORDER", payload: { id } });
    await markLocalOrderStatus(id, "CANCELLED", { pendingSync: true });
    return {
      offline: true as const,
      message: offlineOkMessage("Order cancelled"),
    };
  },
};

export const inventoryApi = {
  list: () => inventoryRepo.list(),
  create: async (payload: Partial<InventoryItem> | Record<string, unknown>) => {
    try {
      if (!isOnline()) throw new ApiError("Network unavailable", 0);
      const created = await apiFetch<InventoryItem>("/inventory", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await inventoryRepo.list();
      return { data: created, offline: false as const };
    } catch (e) {
      if (!isNetworkError(e) && isOnline()) throw e;
      const local: InventoryItem = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        name: String(payload.name || "Item"),
        category: String(payload.category || ""),
        unit: String(payload.unit || "g"),
        unit_kind: String(payload.unit_kind || "WEIGHT"),
        purchase_unit: String(
          payload.purchase_unit || payload.unit || "g",
        ),
        units_per_purchase: Number(payload.units_per_purchase) || 1,
        stock: Number(payload.stock) || 0,
        purchase_price: Number(payload.purchase_price) || 0,
        avg_cost_micros: Number(payload.avg_cost_micros) || 0,
        minimum_stock: Number(payload.minimum_stock) || 0,
        supplier: String(payload.supplier || ""),
        is_active: payload.is_active !== false,
      };
      const items = await listLocalInventory();
      await replaceInventory([local, ...items]);
      await enqueueAndTrack({
        type: "CREATE_INVENTORY",
        payload: { ...payload, id: local.id },
      });
      return {
        data: local,
        offline: true as const,
        message: offlineOkMessage("Inventory item"),
      };
    }
  },
  update: async (id: string, updates: Record<string, unknown>) => {
    const current = (await listLocalInventory()).find((i) => i.id === id);
    const expected_stock = current?.stock;
    try {
      if (!isOnline()) throw new ApiError("Network unavailable", 0);
      await apiFetch<null>(`/inventory/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      await inventoryRepo.list();
      return { offline: false as const };
    } catch (e) {
      if (!isNetworkError(e) && isOnline()) throw e;
      const items = await listLocalInventory();
      await replaceInventory(
        items.map((i) =>
          i.id === id
            ? ({
                ...i,
                ...updates,
                updated_at: new Date().toISOString(),
              } as InventoryItem)
            : i,
        ),
      );
      await enqueueAndTrack({
        type: "UPDATE_INVENTORY",
        payload: { id, updates, expected_stock },
      });
      return {
        offline: true as const,
        message: offlineOkMessage("Inventory update"),
      };
    }
  },
  remove: (id: string) =>
    apiFetch<null>(`/inventory/${id}`, { method: "DELETE" }),
  wastage: async (inventoryId: string, quantity: number, reason: string) => {
    if (!isOnline()) throw new ApiError("Wastage requires internet", 0);
    await apiFetch<unknown>("/inventory/wastage", {
      method: "POST",
      body: JSON.stringify({
        inventory_id: inventoryId,
        quantity,
        reason,
      }),
    });
    await inventoryRepo.list();
  },
  productWastage: async (payload: {
    productId: string;
    productSizeId?: string;
    quantity: number;
    reason: string;
  }) => {
    if (!isOnline()) throw new ApiError("Wastage requires internet", 0);
    const result = await apiFetch<{
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
    await inventoryRepo.list();
    return result;
  },
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
    if (!isOnline()) throw new ApiError("Bulk save requires internet", 0);
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
    await inventoryRepo.list();
  },
};

export const inventoryTransactionsApi = {
  list: async (inventoryId?: string, type?: string) => {
    const params = new URLSearchParams();
    if (inventoryId) params.set("inventory_id", inventoryId);
    if (type) params.set("type", type);
    const qs = params.toString() ? `?${params}` : "";
    return apiFetch<
      (InventoryTransaction & {
        inventory?: { id: string; name: string; unit: string };
      })[]
    >(`/inventory/transactions${qs}`);
  },
};

export const recipesApi = {
  list: async () => {
    const { cacheGet, cacheSet } = await import("@/lib/offline-db");
    if (isOnline()) {
      try {
        const data = await apiFetch<Recipe[]>("/recipes");
        await cacheSet("recipes", data);
        return data;
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        return (await cacheGet<Recipe[]>("recipes")) || [];
      }
    }
    return (await cacheGet<Recipe[]>("recipes")) || [];
  },
  listByProduct: (productId: string) =>
    apiFetch<Recipe[]>(`/recipes/product/${productId}`),
  create: async (payload: Partial<Recipe>) => {
    try {
      if (!isOnline()) throw new ApiError("Network unavailable", 0);
      return await apiFetch<Recipe>("/recipes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (e) {
      if (!isNetworkError(e) && isOnline()) throw e;
      throw new Error("Recipes require internet connection");
    }
  },
  update: (id: string, updates: Record<string, unknown>) =>
    apiFetch<null>(`/recipes/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  remove: (id: string) =>
    apiFetch<null>(`/recipes/${id}`, { method: "DELETE" }),
  replaceSet: (payload: {
    product_id: string;
    product_size_id?: string | null;
    lines: { inventory_id: string; quantity_required: number }[];
  }) =>
    apiFetch<Recipe[]>("/recipes/set", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
};

export const offersApi = {
  list: async () => {
    const { cacheGet, cacheSet } = await import("@/lib/offline-db");
    if (isOnline()) {
      try {
        const data = await apiFetch<Offer[]>("/offers");
        await cacheSet("offers", data);
        return data;
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        return (await cacheGet<Offer[]>("offers")) || [];
      }
    }
    return (await cacheGet<Offer[]>("offers")) || [];
  },
  create: async (payload: Partial<Offer>) => {
    try {
      if (!isOnline()) throw new ApiError("Network unavailable", 0);
      return {
        data: await apiFetch<Offer>("/offers", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
        offline: false as const,
      };
    } catch (e) {
      if (!isNetworkError(e) && isOnline()) throw e;
      await enqueueAndTrack({ type: "CREATE_OFFER", payload });
      return {
        data: null,
        offline: true as const,
        message: offlineOkMessage("Offer"),
      };
    }
  },
  update: async (id: string, updates: Record<string, unknown>) => {
    try {
      if (!isOnline()) throw new ApiError("Network unavailable", 0);
      await apiFetch<null>(`/offers/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      return { offline: false as const };
    } catch (e) {
      if (!isNetworkError(e) && isOnline()) throw e;
      await enqueueAndTrack({ type: "UPDATE_OFFER", payload: { id, updates } });
      return {
        offline: true as const,
        message: offlineOkMessage("Offer update"),
      };
    }
  },
  enable: (id: string) =>
    apiFetch<null>(`/offers/${id}/enable`, { method: "PATCH" }),
  disable: (id: string) =>
    apiFetch<null>(`/offers/${id}/disable`, { method: "PATCH" }),
  remove: (id: string) =>
    apiFetch<null>(`/offers/${id}`, { method: "DELETE" }),
};

export const settingsApi = {
  get: () => settingsRepo.get(),
  update: async (updates: Record<string, unknown>) => {
    try {
      if (!isOnline()) throw new ApiError("Network unavailable", 0);
      const data = await apiFetch<Settings>("/settings", {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      await saveLocalSettings(data);
      return { data, offline: false as const };
    } catch (e) {
      if (!isNetworkError(e) && isOnline()) throw e;
      const current = (await getLocalSettings()) || (await settingsRepo.get());
      const merged = {
        ...current,
        ...updates,
        updated_at: new Date().toISOString(),
      } as Settings;
      await saveLocalSettings(merged);
      await enqueueAndTrack({ type: "UPDATE_SETTINGS", payload: updates });
      return {
        data: merged,
        offline: true as const,
        message: offlineOkMessage("Settings"),
      };
    }
  },
};

const analyticsRefreshAt = new Map<string, number>();
const ANALYTICS_REFRESH_COOLDOWN_MS = 30_000;

/**
 * Informational cloud analytics: paint last snapshot, refresh in background.
 * Dashboard sales totals do NOT use this — they read local COMPLETED orders.
 */
async function cachedAnalytics<T>(
  cacheKey: string,
  fetchRemote: () => Promise<T>,
  fallback: T,
): Promise<T> {
  const cached = await cacheGet<T>(cacheKey);
  const lastRefresh = analyticsRefreshAt.get(cacheKey) || 0;

  if (
    isOnline() &&
    Date.now() - lastRefresh >= ANALYTICS_REFRESH_COOLDOWN_MS
  ) {
    analyticsRefreshAt.set(cacheKey, Date.now());
    void fetchRemote()
      .then(async (data) => {
        if (data === null || data === undefined) return;
        await cacheSet(cacheKey, data);
        notifyCacheUpdated(["analytics"]);
      })
      .catch(() => undefined);
  }

  return cached ?? fallback;
}

/** Always from IndexedDB COMPLETED orders — works offline, updates after each sale. */
async function localSalesTotals() {
  const orders = await listLocalOrders();
  const now = new Date();
  const today = localSalesForKarachiDay(orders, karachiYmd(now));
  return {
    today: today.total,
    todayCount: today.orderCount,
    yesterday: localYesterdaySales(orders, now),
    weekly: localWeeklySales(orders, now),
    monthly: localMonthlySales(orders, now),
  };
}

/**
 * Prefer local IndexedDB for the till's live book. Cloud can lag behind cancels
 * and history edits — using max(local, cloud) would keep cancelled sales in
 * today's total until sync catches up. Only fall back to cloud when this till
 * has no completed sales for the window (empty/new browser).
 */
async function bestSalesFigure(
  localTotal: number,
  localCount: number,
  fetchCloud: () => Promise<{ total: number; order_count?: number }>,
): Promise<{ total: number; order_count: number }> {
  if (!isOnline()) {
    return { total: localTotal, order_count: localCount };
  }
  try {
    const orders = await listLocalOrders();
    const hasUnsyncedTerminal = orders.some(
      (o) =>
        (o.sync_status === "pending_sync" || o.sync_status === "sync_failed") &&
        (o.order_status === "COMPLETED" || o.order_status === "CANCELLED"),
    );
    if (hasUnsyncedTerminal || localCount > 0 || localTotal > 0) {
      return { total: localTotal, order_count: localCount };
    }
    const cloud = await fetchCloud();
    return {
      total: Number(cloud.total) || 0,
      order_count: Number(cloud.order_count) || 0,
    };
  } catch {
    return { total: localTotal, order_count: localCount };
  }
}

export const analyticsApi = {
  todaySales: async () => {
    const { today, todayCount } = await localSalesTotals();
    return bestSalesFigure(today, todayCount, async () => {
      const date = karachiYmd();
      return apiFetch<{ total: number; order_count: number }>(
        `/analytics/sales?date=${encodeURIComponent(date)}`,
      );
    });
  },
  cloudSalesForDay: (dayYmd?: string) => {
    const date = dayYmd || karachiYmd();
    return apiFetch<{
      total: number;
      order_count: number;
      from: string;
      to: string;
    }>(`/analytics/sales?date=${encodeURIComponent(date)}`);
  },
  reconcileDay: async (dayYmd?: string) => {
    const date = dayYmd || karachiYmd();
    const orders = await listLocalOrders();
    const local = localSalesForKarachiDay(orders, date);
    let cloud: { total: number; order_count: number } | null = null;
    if (isOnline()) {
      try {
        cloud = await apiFetch<{ total: number; order_count: number }>(
          `/analytics/sales?date=${encodeURIComponent(date)}`,
        );
      } catch {
        cloud = null;
      }
    }
    return {
      date,
      local_total: local.total,
      local_count: local.orderCount,
      cloud_total: cloud?.total ?? null,
      cloud_count: cloud?.order_count ?? null,
      matched:
        cloud != null &&
        cloud.total === local.total &&
        cloud.order_count === local.orderCount,
    };
  },
  yesterdaySales: async () => {
    const { yesterday } = await localSalesTotals();
    const best = await bestSalesFigure(yesterday, 0, async () => {
      const r = await apiFetch<{ total: number }>("/analytics/yesterday-sales");
      return { total: r.total };
    });
    return { total: best.total };
  },
  weeklySales: async () => {
    const { weekly } = await localSalesTotals();
    const best = await bestSalesFigure(weekly, 0, async () => {
      const r = await apiFetch<{ total: number }>("/analytics/weekly-sales");
      return { total: r.total };
    });
    return { total: best.total };
  },
  monthlySales: async () => {
    const { monthly } = await localSalesTotals();
    const best = await bestSalesFigure(monthly, 0, async () => {
      const r = await apiFetch<{ total: number }>("/analytics/monthly-sales");
      return { total: r.total };
    });
    return { total: best.total };
  },
  /** Single day: { date } or range: { from, to } — Asia/Karachi calendar days. */
  salesForPeriod: (params: { date: string } | { from: string; to: string }) => {
    const q =
      "date" in params
        ? `date=${encodeURIComponent(params.date)}`
        : `from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}`;
    return apiFetch<{
      total: number;
      order_count: number;
      from: string;
      to: string;
    }>(`/analytics/sales?${q}`);
  },
  bestSelling: () =>
    cachedAnalytics(
      "analytics:best",
      () =>
        apiFetch<Record<string, unknown>[]>(
          "/analytics/best-selling-products",
        ),
      [],
    ),
  cancelled: () =>
    cachedAnalytics(
      "analytics:cancelled",
      () => apiFetch<{ count: number }>("/analytics/cancelled-orders"),
      { count: 0 },
    ),
  paymentBreakdown: () =>
    cachedAnalytics(
      "analytics:payments",
      () =>
        apiFetch<Record<string, unknown>[]>(
          "/analytics/payment-breakdown",
        ),
      [],
    ),
  remainingInventory: () =>
    cachedAnalytics(
      "analytics:inventory",
      () =>
        apiFetch<
      {
        id: string;
        name: string;
        unit: string;
        purchase_unit?: string;
        units_per_purchase?: number;
        stock: number;
        minimum_stock: number;
        category?: string;
        is_active?: boolean;
      }[]
        >("/analytics/remaining-inventory"),
      [],
    ),
};

export type PosExpense = {
  id: string;
  category: string;
  title: string;
  amount: number;
  expenseDate: string;
  paymentMethod: string;
  notes: string;
  receiptImage: string;
  recurrence: string;
};

export const expensesApi = {
  categories: () => apiFetch<string[]>("/expenses/categories"),
  list: async (): Promise<PosExpense[]> => {
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
    >("/expenses");
    return (rows || []).map((e) => ({
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
  remove: (id: string) => apiFetch(`/expenses/${id}`, { method: "DELETE" }),
};
