/* Krunchies POS Service Worker — App Shell + static assets
 *
 * v7: Soft navigations (RSC) no longer hang on slow Wi‑Fi.
 * Core screens serve from cache / fail fast so the UI opens immediately;
 * React Query + IndexedDB still load live data in the background.
 */
const CACHE_VERSION = "alrehman-pos-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const PRODUCT_CACHE = `${CACHE_VERSION}-products`;
const RUNTIME_MAX_ENTRIES = 120;
const PRODUCT_MAX_ENTRIES = 200;

/** Soft-nav timeout on flaky shop Wi‑Fi (ms). Dead net fails faster; slow net must not hang. */
const RSC_TIMEOUT_MS = 800;
const NAV_TIMEOUT_MS = 1200;
const CORE_RSC_TIMEOUT_MS = 2500;

/** Critical routes only — rest warmed idle via WARM_SHELL. */
const PRECACHE_URLS = [
  "/",
  "/login",
  "/orders/new",
  "/orders/pending",
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

/** Extra routes warmed after install (idle), not blocking first paint. */
const WARM_URLS = [
  "/orders/history",
  "/dashboard",
  "/products",
  "/categories",
  "/inventory",
  "/analytics",
  "/settings",
];

/** Screens staff open constantly — prefer cache, never hang the click. */
const CORE_STATIC_PATHS = [
  "/orders/new",
  "/orders/pending",
  "/orders/history",
  "/dashboard",
  "/login",
  "/",
];

const APP_SHELL_FALLBACKS = [
  "/orders/new",
  "/orders/pending",
  "/",
  "/login",
  "/offline",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (err) {
            console.warn("[sw] precache failed", url, err);
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (k) =>
              k.startsWith("alrehman-pos-") && !k.startsWith(CACHE_VERSION),
          )
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "WARM_SHELL") {
    event.waitUntil(warmShellRoutes());
  }
});

async function warmShellRoutes() {
  const cache = await caches.open(SHELL_CACHE);
  const urls = [...PRECACHE_URLS, ...WARM_URLS];
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { credentials: "same-origin" });
        if (response.ok) await cache.put(url, response.clone());
      } catch {
        /* ignore — may already be offline */
      }
    }),
  );
}

function isCorePath(pathname) {
  return CORE_STATIC_PATHS.includes(pathname);
}

/** Same-origin Request key — Cache API needs a real URL, not a free-form string. */
function rscCacheRequest(url) {
  const path = url.pathname === "" ? "/" : url.pathname;
  return new Request(
    `${self.location.origin}/__sw_rsc_cache__${path}${url.search}`,
  );
}

/** fetch() that aborts on slow Wi‑Fi instead of hanging forever. */
function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept cross-origin (API lives on another host)
  if (url.origin !== self.location.origin) return;

  // Never cache app API proxies or Next data routes
  if (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/_next/data") ||
    request.headers.get("Authorization")
  ) {
    return;
  }

  // Product images — cache-first (immutable WebPs)
  if (url.pathname.startsWith("/products/")) {
    event.respondWith(cacheFirst(request, PRODUCT_CACHE, PRODUCT_MAX_ENTRIES));
    return;
  }

  // Next.js hashed static assets — cache-first with eviction
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE, RUNTIME_MAX_ENTRIES));
    return;
  }

  // Soft navigations (RSC) — cache-first for core screens; always timeout.
  const isRsc =
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-State-Tree") != null ||
    request.headers.get("Next-Router-Prefetch") != null;
  if (isRsc) {
    event.respondWith(rscHandler(request));
    return;
  }

  // Navigations — core paths cache-first; others network with timeout + shell fallback
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Icons / manifest / known app HTML routes
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".webmanifest") ||
    PRECACHE_URLS.includes(url.pathname) ||
    WARM_URLS.includes(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
  }
});

/**
 * Soft nav: never hang. Prefer cached RSC for core POS routes.
 * On miss/timeout → Response.error() so Next can hard-navigate to cached HTML.
 */
async function rscHandler(request) {
  const url = new URL(request.url);
  const pathname = url.pathname === "" ? "/" : url.pathname;
  const core = isCorePath(pathname);
  const cache = await caches.open(SHELL_CACHE);
  const keyReq = rscCacheRequest(url);

  if (core) {
    const cached = await cache.match(keyReq);
    if (cached) {
      void refreshRscCache(request, cache, keyReq, CORE_RSC_TIMEOUT_MS);
      return cached;
    }
  }

  try {
    const response = await fetchWithTimeout(
      request,
      core ? CORE_RSC_TIMEOUT_MS : RSC_TIMEOUT_MS,
    );
    if (response.ok) {
      try {
        await cache.put(keyReq, response.clone());
      } catch {
        /* ignore quota */
      }
    }
    return response;
  } catch {
    const cached = await cache.match(keyReq);
    if (cached) return cached;
    // Fail the soft navigation quickly — navigate handler serves HTML shell.
    return Response.error();
  }
}

async function refreshRscCache(request, cache, keyReq, timeoutMs) {
  try {
    const response = await fetchWithTimeout(request, timeoutMs);
    if (response.ok) await cache.put(keyReq, response.clone());
  } catch {
    /* keep previous cache entry */
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const extra = keys.length - maxEntries;
  for (let i = 0; i < extra; i++) {
    await cache.delete(keys[i]);
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      await trimCache(cacheName, maxEntries);
    }
    return response;
  } catch {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        cache.put(request, response.clone());
        await trimCache(cacheName, RUNTIME_MAX_ENTRIES);
      }
      return response;
    })
    .catch(() => cached);
  return cached || networkPromise;
}

async function matchShell(cache, request) {
  const url = new URL(request.url);
  const pathname = url.pathname === "" ? "/" : url.pathname;

  return (
    (await cache.match(request)) ||
    (await cache.match(pathname)) ||
    (await cache.match(new Request(pathname))) ||
    null
  );
}

async function shellFallback(request) {
  const cache = await caches.open(SHELL_CACHE);
  let cached = await matchShell(cache, request);

  if (!cached) {
    for (const path of APP_SHELL_FALLBACKS) {
      cached =
        (await cache.match(path)) ||
        (await cache.match(new Request(path)));
      if (cached) break;
    }
  }

  if (!cached) {
    cached =
      (await caches.match("/offline")) ||
      (await caches.match(new Request("/offline")));
  }

  return (
    cached ||
    new Response(
      "<!doctype html><title>Offline</title><h1>Krunchies POS</h1><p>Open New Order from the home screen after connecting once.</p><p><a href='/orders/new'>New Order</a> · <a href='/orders/pending'>Pending</a></p>",
      {
        status: 503,
        headers: { "Content-Type": "text/html" },
      },
    )
  );
}

async function navigationHandler(request) {
  const cache = await caches.open(SHELL_CACHE);
  const url = new URL(request.url);
  const pathname = url.pathname === "" ? "/" : url.pathname;
  const core = isCorePath(pathname);

  // Core POS screens: open from cache immediately, refresh shell in background.
  if (core) {
    const cached = await matchShell(cache, request);
    if (cached) {
      void (async () => {
        try {
          const response = await fetchWithTimeout(request, 4000);
          if (response.ok) {
            await cache.put(request, response.clone());
            await cache.put(pathname, response.clone());
            await trimCache(SHELL_CACHE, 40);
          }
        } catch {
          /* keep cached shell */
        }
      })();
      return cached;
    }
  }

  try {
    const response = await fetchWithTimeout(request, NAV_TIMEOUT_MS);
    if (response.ok) {
      await cache.put(request, response.clone());
      await cache.put(pathname, response.clone());
      await trimCache(SHELL_CACHE, 40);
    }
    return response;
  } catch {
    return shellFallback(request);
  }
}
