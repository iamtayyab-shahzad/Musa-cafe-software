# Krunchies POS — Production Documentation

This document covers architecture, synchronization, IndexedDB, offline workflows, scaling, deployment, maintenance, limitations, security, and production readiness for the **POS** application.

Website and Admin are separate apps and are **online-only** (Vercel) for customer/admin workflows. The shop till is **local-first**: a production Next.js build on the cashier PC (`127.0.0.1`) with **IndexedDB** as the working copy of orders, catalog, and sales. The cloud API is for login and background sync. Optional Vercel POS is emergency fallback only. See [`LOCAL-POS-PHASE-1.md`](./LOCAL-POS-PHASE-1.md).

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  UI (App Router pages + BillProvider + Shell)               │
│  Never calls fetch() for business data directly             │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  services/api.ts  (facade)                                  │
│  Returns success immediately for queueable offline writes   │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌──────────────────────┐      ┌──────────────────────────────┐
│  Repository layer    │      │  Sync Engine                 │
│  lib/repos           │      │  lib/sync-engine.ts          │
│  IndexedDB-first read│      │  outbox + backoff + remap    │
└──────────┬───────────┘      └──────────────┬───────────────┘
           │                                 │
           ▼                                 ▼
┌──────────────────────┐      ┌──────────────────────────────┐
│  IndexedDB (idb)     │◄────►│  Backend API (Go / Postgres)  │
│  lib/offline-db.ts   │      │  client_order_id idempotency │
└──────────────────────┘      └──────────────────────────────┘
```

### Layers

| Layer | Responsibility |
|-------|----------------|
| **UI** | Capture cashier intent, show offline toasts, print receipts |
| **API facade** | Normalize online/offline outcomes; enqueue writes |
| **Repos** | IndexedDB-first reads; background API refresh when online |
| **Sync engine** | Drain queue, remap IDs, conflicts, dead-letter |
| **IndexedDB** | Local working copy for the till (orders store, catalog, session) |
| **Service Worker** | App shell + static assets only (never API bodies) |

### Key principles

1. **UI never chooses the data source** — repos decide.
2. **Writes never fail solely because the network is down** — store locally + queue.
3. **Server is source of truth after sync** — especially inventory stock.
4. **Idempotent order create** via `client_order_id` (UUID).

---

## 2. Synchronization

### Triggers

- App startup (if online)
- Browser `online` event
- Interval (~45s)
- Manual “Sync now”
- After enqueue (opportunistic)

### Flow

1. Load due queue items (`next_retry_at` passed, not `dead`, not `synced`).
2. Process FIFO, single-flight (`syncPromise`).
3. On success → `markActionSynced`.
4. On CREATE_ORDER → map `localId → serverId`, delete LOCAL row, apply follow-up COMPLETE/CANCEL/UPDATE.
5. On retryable failure → exponential backoff (1s → 60s), `attempts++`.
6. On permanent 4xx or `attempts >= 8` → **dead-letter** + conflict log.
7. Refresh orders/inventory from server; keep unsynced LOCAL orders.
8. Emit `pos-sync-complete` → React Query invalidation.

### Duplicate prevention

- Each offline order gets a UUID used as `client_order_id`.
- Backend `CreateOrder` returns the existing order if `client_order_id` already exists.
- Client skips enqueue if a CREATE for the same client id is already pending.

### Inventory conflicts

- Offline UPDATE stores `expected_stock`.
- On sync, if server stock ≠ expected → log conflict, **keep server stock**, apply non-stock fields only.

### Observability (UI)

- Pending sync counter
- Sync progress (`completed/total`)
- Last sync time
- Dead-letter / conflict counts

---

## 3. IndexedDB schema

**Database:** `krunchies-pos`  
**Current version:** `3`

| Store | Key | Purpose |
|-------|-----|---------|
| `pending_drafts` | `id` | Active cart draft (`active-cart`) |
| `offline_queue` | `id` | Outbox actions (+ `synced`, `dead`, `attempts`, `next_retry_at`) |
| `cache` | `key` | KV: settings mirror, locations, sync_meta, order_id_map, conflicts |
| `products` | `id` | Catalog (+ sizes embedded) |
| `categories` | `id` | Categories |
| `orders` | `id` | Local till history (capped ~2000 newest; unsynced rows kept) |
| `inventory` | `id` | Stock rows |
| `settings` | `id` (`default`) | Restaurant settings |
| `session` | `id` (`current`) | Cached JWT session |
| `customers` | `id` | Derived from orders |

### Operational cache keys

`products`, `categories`, `orders`, `inventory`, `settings`, `session`, `customers`, `locations`, `offers`, `recipes`, `sync_meta`, `sync_conflicts`, `order_id_map`

### Cleanup

- Synced queue: keep last 50
- Dead-letter: keep last 30
- Orders store: keep newest 2000 (unsynced rows kept)
- ID map: trim above 500 entries
- SW runtime cache: max 80 entries (v3)

---

## 4. Offline workflow

### Cashier day

1. **Login online once** → menu/settings/inventory warm into IndexedDB; session cached.
2. **Disconnect** → shell shows Offline; catalog/search/cart still work from cache.
3. **Create unlimited walk-in/phone orders** → LOCAL numbers, queued CREATE (+ COMPLETE if cash complete).
4. **Receipts print** from local order (product names embedded).
5. **Cart survives refresh** via draft autosave.
6. **Reconnect** → sync engine drains queue; LOCAL rows replaced by server orders; Pending/History update.

### Session

- JWT in `localStorage` + IndexedDB session.
- 401 / logout clears **both**.
- Login offers **Continue offline** when a non-expired session exists.

### What works offline

Products, categories, search, cart, checkout, cash payments, order create/complete/cancel, pending, history, inventory edits, settings edits, receipts, cart recovery, PWA shell.

### What needs internet

- First-time login (no prior session)
- Pulling website/phone orders from the cloud into local Pending
- Cloud sales compare / reconcile (dashboard still shows IndexedDB totals offline)
- Recipe create
- Product size create against server (product row can be queued)

---

## 5. Future scaling recommendations

1. **Multi-terminal**: add device_id to queue + server conflict UI; optional WebSocket sync status.
2. **Background Sync API** / Periodic Background Sync for drain when tab closed (HTTPS + browser support).
3. **Dexie or OPFS** if order history grows beyond thousands/day.
4. **Split POS build**: catalog chunk vs bill UI for faster cold start on tablets.
5. **Server-side outbox ack** with sequence numbers for stronger multi-device ordering.
6. **Printers**: ESC/POS USB/Bluetooth adapter instead of browser print dialog.
7. **Role-based offline**: restrict inventory/settings mutations by staff role even offline.
8. **E2E suite**: Playwright scenarios for offline create → reconnect → no duplicates.

---

## 6. Deployment guide (POS)

See also root `DEPLOYMENT.md` for full stack.

### POS (shop till — local)

Daily production is the **Krunchies POS** desktop shortcut on the cashier PC, not Vercel.

1. Copy/pull the repo onto the shop PC
2. Run `pos\scripts\Setup-Local-POS.bat` (writes `NEXT_PUBLIC_API_URL` into `pos/.env.local` and builds)
3. Open the shortcut once online, sign in, wait for a successful sidebar sync
4. Smoke test: New Order, Pending, History, print; then the same with Wi-Fi off

IndexedDB lives in the dedicated Chrome profile (`%LOCALAPPDATA%\KrunchiesPOS\chrome-profile`). Rebuilds do not wipe it.

Optional **Vercel POS** is emergency remote fallback (`pos\scripts\Launch-POS.bat`). If you still deploy it: project root `pos`, same `NEXT_PUBLIC_API_URL`, HTTPS for that URL only.

### Backend requirement

Redeploy API so Postgres gets unique `client_order_id`. Without it, duplicate prevention is incomplete.

### Post-deploy checklist

- [ ] `/health` OK  
- [ ] Staff login OK  
- [ ] Menu cached after login  
- [ ] Shop shortcut opens `127.0.0.1` Chrome app (or optional cloud POS as fallback)  
- [ ] Airplane mode: create + complete cash order + print  
- [ ] Restore network: queue drains, order appears in Admin/history  
- [ ] Duplicate offline submit does not create two server orders  

---

## 7. Maintenance guide

### Daily

- Glance at sidebar: pending sync count should return to 0 after reconnect.
- Investigate amber “failed sync items” if non-zero.

### Weekly

- After a shop rebuild (`Setup-Local-POS.bat`), confirm the shortcut still opens and syncs. Cloud POS: PWA update banner / Refresh if you still use it.
- Spot-check inventory conflicts if stock is adjusted both online and offline.

### After menu changes (Admin)

- Ask POS to login once online (or call warm cache) so tablets refresh catalog.

### Clearing local data (last resort)

DevTools → Application → IndexedDB → delete `krunchies-pos` → hard refresh → login online.

### Seed credentials

Change default `staff` / `admin` passwords in production. Demo credentials are **hidden** unless `NODE_ENV=development` or `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=true`.

---

## 8. Known limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| Dashboard/analytics prefer cloud when it is higher | Offline or unsynced completes still count from IndexedDB | History + Storage Health if totals look wrong |
| Recipes require internet | Cannot add recipes offline | Plan recipe edits while online |
| JWT in localStorage/IDB | XSS can steal token | CSP, no untrusted HTML, rotate JWT secret |
| Browser print only | Thermal printer UX varies | Train staff / future ESC/POS |
| Single-device outbox | Two tablets can race inventory | Inventory conflict logging; server wins stock |
| Service worker ≠ data sync | Offline data is IndexedDB, not Cache API | Documented; intentional |
| Edit-pending mid-refresh | Edit context not persisted | Finish edits before closing tab |
| Large history capped at ~2000 local | Older local rows drop | Server remains source for history when online |

---

## 9. Security recommendations

1. **Rotate JWT_SECRET** and default staff passwords before go-live.
2. Shop till is `127.0.0.1` (no public HTTPS). Website/admin/optional cloud POS stay on Vercel HTTPS.
3. Set restrictive **Content-Security-Policy** headers if not already at edge.
4. Do not enable `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS` in production.
5. Ensure SW never caches authenticated API responses (current design: cross-origin API not intercepted).
6. Clear session on logout **and** 401 (implemented).
7. Prefer short JWT expiry + re-login policy for shared tablets.
8. Audit who can mutate inventory/settings (backend RBAC).
9. Back up Neon Postgres; POS local data is not a DR substitute.
10. Monitor Render logs for repeated 4xx from sync dead-letters.

---

## 10. Production readiness report

### Verdict

**Ready for a single-shop pizza POS** with staff trained on: use the desktop shortcut, work offline, reconnect to sync, escalate failed sync badges. Owner rebuilds via `Setup-Local-POS.bat` when shipping POS changes.

### Implemented for production

- Offline-first read/write path for core cashier flows  
- Sync engine with backoff, dead-letter, ID remap, conflict logging  
- `client_order_id` idempotent creates (backend + POS)  
- Cart draft recovery  
- Correct offline delivery/COD totals  
- Bounded caches (IDB orders, SW runtime, queue prune)  
- Session restore + secure clear on 401/logout  
- Loading/empty/error states on New Order  
- Production-hidden demo credentials  
- Hardened service worker v3  

### Automated verification run

- `npx tsc --noEmit`  
- `npx next build`  

### Manual QA to run on staging before first busy Friday

1. Normal online order (cash walk-in) + receipt  
2. Offline: 20+ orders mix pending/complete  
3. Refresh mid-cart offline → cart restored  
4. Reconnect → sync to 0 pending; Admin sees orders once  
5. Double-submit same offline order → one server row  
6. Offline inventory edit + online stock change → conflict logged, server stock kept  
7. Logout / login / continue offline  
8. Rebuild/reopen the local shortcut (or force SW update on optional cloud POS)

### Residual risk (acceptable with process)

- Multi-tablet inventory races (logged, not auto-merged beyond server-wins stock)
- No automated E2E in CI yet

---

*Last updated: local-first shop till (IndexedDB) with optional Vercel fallback.*
