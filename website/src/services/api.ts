import { reviews, categories as localCategories, products as localProducts } from "@/data/krunchies";
import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/constants";
import type {
  Category,
  CreateOrderPayload,
  Customer,
  LoginPayload,
  Location,
  Offer,
  Order,
  Product,
  ProductSize,
  RegisterPayload,
  Settings,
} from "@/types";

const FETCH_TIMEOUT_MS = 10_000;

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

async function backendFetch<T>(
  path: string,
  options: RequestInit = {},
  withAuth = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (withAuth && typeof window !== "undefined") {
    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
      // Next.js server components: cache catalog briefly (ISR-friendly).
      ...(typeof window === "undefined"
        ? { next: { revalidate: 60 } }
        : {}),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Menu request timed out. Please retry.");
    }
    throw new Error("Network unavailable. Showing saved menu.");
  } finally {
    clearTimeout(timeout);
  }

  const json = (await res.json().catch(() => null)) as
    | { success: boolean; message: string; data: T }
    | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || `Request failed (${res.status})`);
  }
  return json.data;
}

const SETTINGS_TTL_MS = 120_000;
let settingsCache: { at: number; promise: Promise<Settings> } | null = null;

export async function getSettings() {
  const now = Date.now();
  if (settingsCache && now - settingsCache.at < SETTINGS_TTL_MS) {
    return settingsCache.promise;
  }
  const promise = backendFetch<Settings>("/settings/public").catch((err) => {
    settingsCache = null;
    throw err;
  });
  settingsCache = { at: now, promise };
  return promise;
}

const CATALOG_TTL_MS = 60_000;
type CatalogPayload = {
  categories: Category[];
  products: Product[];
  fromFallback?: boolean;
};
let catalogCache: { at: number; promise: Promise<CatalogPayload> } | null =
  null;

function localCatalogFallback(): CatalogPayload {
  const categories = localCategories.filter((c) => c.visible !== false);
  const products = localProducts
    .filter((p) => p.available !== false)
    .map((p) => ({
      ...p,
      category: categories.find((c) => c.id === p.category_id),
    }))
    .sort((a, b) => a.display_order - b.display_order);
  return { categories, products, fromFallback: true };
}

async function loadCatalog(force = false): Promise<CatalogPayload> {
  const now = Date.now();
  if (!force && catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.promise;
  }

  const promise = (async () => {
    try {
      const [categories, remoteProducts, remoteSizes] = await Promise.all([
        backendFetch<Category[]>("/categories"),
        backendFetch<Product[]>("/products"),
        backendFetch<ProductSize[]>("/product-sizes"),
      ]);

      const sizesByProduct = new Map<string, ProductSize[]>();
      for (const s of remoteSizes) {
        const arr = sizesByProduct.get(s.product_id) || [];
        arr.push(s);
        sizesByProduct.set(s.product_id, arr);
      }

      const categoryById = new Map(categories.map((c) => [c.id, c]));
      const products = remoteProducts
        .filter((p) => p.available)
        .map((p) => ({
          ...p,
          sizes: sizesByProduct.get(p.id) || [],
          category: categoryById.get(p.category_id),
        }))
        .sort((a, b) => a.display_order - b.display_order);

      // Empty remote catalog is treated as failure so customers still see menu.
      if (!products.length) {
        return localCatalogFallback();
      }

      return { categories, products, fromFallback: false };
    } catch {
      return localCatalogFallback();
    }
  })();

  catalogCache = { at: now, promise };
  try {
    return await promise;
  } catch (err) {
    catalogCache = null;
    throw err;
  }
}

/** Clear cached catalog so Retry starts a fresh network fetch. */
export function clearCatalogCache() {
  catalogCache = null;
}

export async function getCategories() {
  const { categories } = await loadCatalog();
  return categories
    .filter((c) => c.visible)
    .sort((a, b) => a.display_order - b.display_order);
}

export async function getProducts(params?: {
  categoryId?: string;
  search?: string;
  featured?: boolean;
  popular?: boolean;
}): Promise<Product[]> {
  const { products } = await loadCatalog();
  let result = products;

  if (params?.categoryId) {
    result = result.filter((p) => p.category_id === params.categoryId);
  }
  if (params?.featured) {
    result = result.filter((p) => p.featured);
  }
  if (params?.popular) {
    // Backend doesn't have `popular`; treat it as "featured".
    result = result.filter((p) => p.featured);
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }

  return result;
}

export async function getProductById(id: string): Promise<Product | null> {
  const { products } = await loadCatalog();
  return products.find((p) => p.id === id) ?? null;
}

export async function refreshCatalog() {
  clearCatalogCache();
  return loadCatalog(true);
}

export async function getOffers() {
  const list = await backendFetch<(Offer & { offer_popup?: boolean })[]>(
    "/offers",
  );
  // `offer_popup` is optional in the DB during migrations; treat missing as true.
  return list.filter(
    (o) => o.active && (o.offer_popup === undefined || o.offer_popup),
  );
}

export async function getLocations() {
  return backendFetch<Location[]>("/locations");
}

export async function getLocationById(id: string) {
  return backendFetch<Location>(`/locations/${id}`).catch(() => null);
}

export async function getReviews() {
  return reviews;
}

export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  return backendFetch<Order>(
    "/orders",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    true,
  );
}

export async function loginCustomer(
  payload: LoginPayload,
): Promise<Customer> {
  const result = await backendFetch<{ customer: Customer; token: string }>(
    "/auth/customers/login",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, result.token);
  return result.customer;
}

export async function registerCustomer(
  payload: RegisterPayload,
): Promise<Customer> {
  const result = await backendFetch<{ customer: Customer; token: string }>(
    "/auth/customers/register",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, result.token);
  return result.customer;
}

export async function getMyProfile(): Promise<Customer> {
  return backendFetch<Customer>("/customers/me", {}, true);
}

export async function updateMyProfile(payload: {
  name?: string;
  default_address?: string;
  default_location_id?: string;
}): Promise<Customer> {
  return backendFetch<Customer>(
    "/customers/me",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    true,
  );
}

/** Newest orders for the logged-in customer (server caps at 5). */
export async function getMyOrders(limit = 5): Promise<Order[]> {
  const q = limit !== 5 ? `?limit=${limit}` : "";
  return backendFetch<Order[]>(`/customers/me/orders${q}`, {}, true);
}

export async function getActiveDiscountRules() {
  const { setDiscountRulesCache } = await import("@/lib/discount-rules");
  try {
    const rules = await backendFetch<
      {
        id: string;
        name: string;
        active: boolean;
        percent: number;
        min_subtotal: number;
        schedule_type: string;
        start_date?: string | null;
        end_date?: string | null;
        weekdays_json?: string;
        exclude_deals?: boolean;
      }[]
    >("/discount-rules/active");
    setDiscountRulesCache(rules || []);
    return rules || [];
  } catch {
    return [];
  }
}

export async function resetCustomerPassword(payload: {
  token: string;
  password: string;
}): Promise<void> {
  await backendFetch<null>(
    "/auth/customers/reset-password",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
