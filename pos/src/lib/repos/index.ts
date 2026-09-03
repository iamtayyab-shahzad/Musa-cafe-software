import { apiFetch } from "@/lib/api-client";
import { isNetworkError, isOnline } from "@/lib/network";
import {
  listLocalCategories,
  listLocalCustomers,
  listLocalInventory,
  listLocalOrders,
  listLocalPendingOrders,
  listLocalProducts,
  getLocalSettings,
  replaceCategories,
  replaceInventory,
  replaceOrdersPreservingUnsynced,
  mergeOrders,
  replaceProducts,
  saveLocalSettings,
  saveSession,
  getSession,
  clearSession,
  upsertLocalOrder,
  type CachedSession,
} from "@/lib/offline-db";
import {
  notifyOrdersChanged,
  notifyCacheUpdated,
} from "@/lib/offline-events";
import {
  krunchiesCategories,
  krunchiesProducts,
} from "@/data/krunchies";
import { shop } from "@/lib/shop";
import type {
  Category,
  Customer,
  InventoryItem,
  Order,
  Product,
  ProductSize,
  Settings,
} from "@/types";

const revalidating = new Set<string>();
const lastRevalidateAt = new Map<string, number>();
/** Avoid invalidate → localFirst → notify → invalidate loops. */
const REVALIDATE_COOLDOWN_MS = 4_000;

function isEmptyCache<T>(local: T | null | undefined): boolean {
  if (local == null) return true;
  if (Array.isArray(local)) return local.length === 0;
  return false;
}

/**
 * Counter-speed reads: return IndexedDB immediately when present, refresh
 * from the API in the background. An empty cache also returns immediately:
 * screen navigation must never wait for a slow/dead network.
 */
async function localFirst<T>(
  cacheKey: string,
  fetchRemote: () => Promise<T>,
  readLocal: () => Promise<T | null | undefined>,
  writeLocal: (data: T) => Promise<void>,
  empty: T,
  notifyKeys?: string[],
): Promise<T> {
  const local = await readLocal();
  const revalidate = async () => {
    if (!isOnline()) return;
    if (revalidating.has(cacheKey)) return;
    const last = lastRevalidateAt.get(cacheKey) || 0;
    if (Date.now() - last < REVALIDATE_COOLDOWN_MS) return;
    revalidating.add(cacheKey);
    lastRevalidateAt.set(cacheKey, Date.now());
    try {
      const data = await fetchRemote();
      await writeLocal(data);
      if (notifyKeys?.length) notifyCacheUpdated(notifyKeys);
    } catch {
      /* background refresh failures are non-fatal */
    } finally {
      revalidating.delete(cacheKey);
    }
  };

  void revalidate();
  return isEmptyCache(local) ? empty : (local as T);
}

async function readLocalProductsWithSeed(): Promise<Product[]> {
  const local = await listLocalProducts();
  if (local.length) return local;
  // A new localhost origin has a fresh IndexedDB. Bundle the official menu so
  // the cashier can sell immediately, even before the first cloud sync.
  await replaceProducts(krunchiesProducts);
  return krunchiesProducts;
}

async function readLocalCategoriesWithSeed(): Promise<Category[]> {
  const local = await listLocalCategories();
  if (local.length) return local;
  await replaceCategories(krunchiesCategories);
  return krunchiesCategories;
}

async function fetchProductsRemote(): Promise<Product[]> {
  const [remoteProducts, remoteSizes] = await Promise.all([
    apiFetch<Product[]>("/products"),
    apiFetch<ProductSize[]>("/product-sizes"),
  ]);
  const sizesByProduct = new Map<string, ProductSize[]>();
  for (const s of remoteSizes) {
    const arr = sizesByProduct.get(s.product_id) || [];
    arr.push(s);
    sizesByProduct.set(s.product_id, arr);
  }
  return remoteProducts.map((p) => ({
    ...p,
    sizes: sizesByProduct.get(p.id) || [],
  }));
}

async function fetchOrdersRemote(): Promise<Order[]> {
  const rows = await apiFetch<Order[]>("/orders?limit=200");
  await replaceOrdersPreservingUnsynced(rows);
  const locals = await listLocalOrders();
  const { seedDailyCountersFromOrders } = await import(
    "@/lib/daily-order-number"
  );
  await seedDailyCountersFromOrders(locals);
  return locals;
}

async function fetchPendingRemote(): Promise<Order[]> {
  const { reconcilePendingOrders } = await import("@/lib/order-identity");
  const { cacheGet, deleteLocalOrder } = await import("@/lib/offline-db");

  const rows = await apiFetch<Order[]>("/orders/pending");
  const existing = await listLocalOrders();
  const idMap =
    (await cacheGet<Record<string, string>>("order_id_map")) || {};

  const { pending, localUpdates, deleteIds } = reconcilePendingOrders(
    rows,
    existing,
    idMap,
  );

  // Persist terminal overlays before deleting LOCAL-* twins so a crashed
  // poll mid-reconcile cannot wipe completion knowledge.
  for (const update of localUpdates) {
    await upsertLocalOrder(update);
  }
  for (const id of deleteIds) {
    await deleteLocalOrder(id);
  }

  // Persist pending rows without resurrecting duplicates.
  await mergeOrders(pending);
  // Hydrate React Query from IDB — do not invalidate (that would start another
  // network pending pull and amplify LOCAL/server races).
  notifyOrdersChanged();
  return listLocalPendingOrders();
}

export const catalogRepo = {
  async listProducts(): Promise<Product[]> {
    return localFirst(
      "products",
      fetchProductsRemote,
      readLocalProductsWithSeed,
      replaceProducts,
      [],
      ["products"],
    );
  },

  /** After a catalog write, replace IndexedDB from the server so sizes don't bounce back. */
  async refreshProducts(): Promise<Product[]> {
    const data = await fetchProductsRemote();
    await replaceProducts(data);
    notifyCacheUpdated(["products"]);
    return data;
  },

  async listCategories(): Promise<Category[]> {
    return localFirst(
      "categories",
      () => apiFetch<Category[]>("/categories"),
      readLocalCategoriesWithSeed,
      replaceCategories,
      [],
      ["categories"],
    );
  },
};

export const ordersRepo = {
  async list(): Promise<Order[]> {
    return localFirst(
      "orders",
      fetchOrdersRemote,
      listLocalOrders,
      async () => {
        /* write handled inside fetchOrdersRemote */
      },
      [],
      ["orders"],
    );
  },

  async pending(): Promise<Order[]> {
    return localFirst(
      "orders-pending",
      fetchPendingRemote,
      listLocalPendingOrders,
      async () => {
        /* merge handled inside fetchPendingRemote */
      },
      [],
      // No notifyKeys: fetchPendingRemote calls notifyOrdersChanged (IDB hydrate)
      // instead of invalidate→refetch storms.
    );
  },

  async get(id: string): Promise<Order> {
    const local = (await listLocalOrders()).find(
      (o) => o.id === id || o.client_order_id === id,
    );
    if (local) {
      if (isOnline()) {
        void apiFetch<Order>(`/orders/${id}`)
          .then(async (remote) => {
            // Never overwrite a local terminal status with a stale server PENDING.
            if (
              (local.order_status === "COMPLETED" ||
                local.order_status === "CANCELLED") &&
              remote.order_status === "PENDING"
            ) {
              await upsertLocalOrder({
                ...remote,
                order_status: local.order_status,
                client_order_id:
                  local.client_order_id ||
                  remote.client_order_id ||
                  local.id,
                sync_status:
                  local.sync_status === "synced" ? "synced" : "pending_sync",
              });
              return;
            }
            await upsertLocalOrder({
              ...remote,
              client_order_id:
                remote.client_order_id || local.client_order_id || local.id,
              sync_status: "synced",
            });
          })
          .catch(() => undefined);
      }
      return local;
    }
    if (isOnline()) {
      try {
        return await apiFetch<Order>(`/orders/${id}`);
      } catch (err) {
        if (!isNetworkError(err)) throw err;
      }
    }
    throw new Error("Order not found offline");
  },
};

export const inventoryRepo = {
  async list(): Promise<InventoryItem[]> {
    return localFirst(
      "inventory",
      () => apiFetch<InventoryItem[]>("/inventory"),
      listLocalInventory,
      replaceInventory,
      [],
      ["inventory"],
    );
  },
};

const emptySettings = (): Settings => ({
  id: "default",
  created_at: "",
  updated_at: "",
  restaurant_name: shop.name,
  phone: "",
  whatsapp: "",
  logo: "",
  opening_time: "10:50 AM",
  closing_time: "11:00 PM",
  cash_on_delivery_fee: 0,
  currency: "Rs",
  google_maps: "",
  facebook: "",
  instagram: "",
  pos_one_click_complete: false,
  pos_allow_history_edit: false,
});

export const settingsRepo = {
  async get(): Promise<Settings> {
    // Settings must reflect admin changes immediately. Prefer the live API
    // when online; IndexedDB is only a fallback for offline POS.
    if (isOnline()) {
      try {
        const data = await apiFetch<Settings>("/settings/public");
        if (data) await saveLocalSettings(data);
        return data;
      } catch {
        const local = await getLocalSettings();
        if (local) return local;
        return emptySettings();
      }
    }

    const local = await getLocalSettings();
    return local || emptySettings();
  },
};

const customerEnrichAt = new Map<string, number>();
const CUSTOMER_ENRICH_COOLDOWN_MS = 8_000;

export const customersRepo = {
  async list(): Promise<Customer[]> {
    // Never wipe unsynced local tickets when rebuilding customers from orders.
    return localFirst(
      "customers",
      async () => {
        const orders = await apiFetch<Order[]>("/orders?limit=200");
        await replaceOrdersPreservingUnsynced(orders);
        const { seedDailyCountersFromOrders } = await import(
          "@/lib/daily-order-number"
        );
        await seedDailyCountersFromOrders(orders);
        return listLocalCustomers();
      },
      listLocalCustomers,
      async () => {
        /* rebuilt via replaceOrdersPreservingUnsynced */
      },
      [],
      ["orders"],
    );
  },

  /**
   * Phone prefix search for POS autofill.
   * Returns local matches immediately. Cloud lookup enriches IndexedDB in the
   * background so typing never waits on flaky Wi‑Fi.
   */
  async search(query: string): Promise<Customer[]> {
    const { normalizePkPhone } = await import("@/lib/utils");
    const {
      searchLocalCustomersByPhone,
      upsertCustomersFromLookup,
    } = await import("@/lib/offline-db");

    const digits = normalizePkPhone(query);
    if (digits.length < 4) return [];

    const local = await searchLocalCustomersByPhone(digits);

    const lastEnrich = customerEnrichAt.get(digits) || 0;
    if (
      isOnline() &&
      Date.now() - lastEnrich >= CUSTOMER_ENRICH_COOLDOWN_MS
    ) {
      customerEnrichAt.set(digits, Date.now());
      void (async () => {
        try {
          const remote = await apiFetch<
            Array<{
              phone: string;
              name: string;
              address: string;
              location_id?: string | null;
              last_order_at: string;
              order_count: number;
            }>
          >(`/orders/customers/lookup?q=${encodeURIComponent(digits)}`);

          if (Array.isArray(remote) && remote.length) {
            await upsertCustomersFromLookup(remote);
            notifyCacheUpdated(["customers"]);
          }
        } catch {
          /* keep local results */
        }
      })();
    }

    return local;
  },
};

export const sessionRepo = {
  save: saveSession,
  get: getSession,
  clear: clearSession,
  async cacheFromToken(username: string, token: string) {
    let exp: number | null = null;
    try {
      const payload = JSON.parse(
        atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      exp = typeof payload.exp === "number" ? payload.exp : null;
    } catch {
      exp = null;
    }
    const session: CachedSession = {
      username,
      token,
      exp,
      saved_at: new Date().toISOString(),
    };
    await saveSession(session);
    return session;
  },
};

export const locationsRepo = {
  async list() {
    const { cacheGet, cacheSet } = await import("@/lib/offline-db");
    type Location = import("@/types").Location;
    return localFirst(
      "locations",
      () => apiFetch<Location[]>("/locations"),
      async () => cacheGet<Location[]>("locations"),
      async (data) => {
        await cacheSet("locations", data);
      },
      [],
      ["locations"],
    );
  },
};

/**
 * Prefetch catalog + settings into IndexedDB (not orders/inventory —
 * sync engine owns those to avoid a startup thundering herd).
 */
export async function warmOfflineCache() {
  if (!isOnline()) return;
  await Promise.allSettled([
    catalogRepo.listProducts(),
    catalogRepo.listCategories(),
    settingsRepo.get(),
    locationsRepo.list(),
  ]);
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    reg?.active?.postMessage({ type: "WARM_SHELL" });
  }
}
