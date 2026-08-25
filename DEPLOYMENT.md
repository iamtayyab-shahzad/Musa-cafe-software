# Musa Cafe — Free Production Deployment Guide

This guide deploys the full stack for **$0** using:

| Piece | Service |
|-------|---------|
| Customer website | [Vercel](https://vercel.com) |
| Admin dashboard | Vercel (2nd project) |
| POS (shop till) | **Local production build** on the cashier PC (`127.0.0.1`), IndexedDB for offline orders. Optional Vercel POS is emergency fallback only. |
| Go API | [Render](https://render.com) (Docker free web service) |
| PostgreSQL | [Neon](https://neon.tech) / Supabase |

---

## 0. Prerequisites

- GitHub account + this repo pushed
- Accounts: Neon, Render, Vercel (all free tiers)
- Strong password ready for admin/staff (change defaults)

Recommended domain layout (optional):

- `www.yourdomain.com` → website  
- `admin.yourdomain.com` → admin  
- Shop POS → desktop shortcut **Musa Cafe POS** (local `127.0.0.1:3001`)  
- `api.yourdomain.com` → backend  

Website and Admin use Vercel HTTPS. The shop till does **not** depend on Vercel for daily use.

---

## 1. Push to GitHub

```bash
git add .
git commit -m "Prepare free-tier deployment"
git push -u origin HEAD
```

Do **not** commit `backend/.env`, `*/.env.local`, or real passwords.

---

## 2. Create free PostgreSQL (Neon)

1. Create a project at https://console.neon.tech  
2. Copy the connection string, e.g.

```text
postgres://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
```

3. Keep this as `DATABASE_URL` for the API.

**Local Postgres cannot be used** for cloud frontends/API — it is only for development on your PC.

---

## 3. Deploy the backend (Render)

1. https://dashboard.render.com → **New** → **Web Service**  
2. Connect your GitHub repo  
3. Settings:

| Field | Value |
|-------|--------|
| Root Directory | `backend` |
| Runtime | **Docker** |
| Dockerfile Path | `./Dockerfile` |
| Instance | Free |
| Health Check Path | `/health` |

4. Environment variables:

| Key | Value |
|-----|--------|
| `APP_ENV` | `production` |
| `DATABASE_URL` | *(paste Neon URL)* |
| `JWT_SECRET` | *(random 32+ characters)* |
| `PORT` | *(Render sets this — do not override unless asked)* |

Cloudinary vars are **optional** and can be left empty.

5. Deploy. When live, open:

- `https://YOUR-API.onrender.com/` → running message  
- `https://YOUR-API.onrender.com/health` → `{"status":"ok"}`

### Seed staff + menu (one-time)

From your PC (with Neon URL):

```bash
cd backend
# Windows PowerShell
$env:DATABASE_URL="postgres://..."
$env:JWT_SECRET="same-as-render"
go run ./cmd/seed
go run ./cmd/importmenu
go run ./cmd/seedinventory
```

Or use Render **Shell** if available on your plan.

`seedinventory` loads ~90 kitchen ingredients from `shared/inventory.json` (cheese, chicken, flour, sauces, spices, packaging, cleaning, etc.). Safe to re-run — it upserts by name.

Default seed logins (change immediately):

- `admin` / `admin@admin`
- `staff` / `staff@54321`

---

## 4. Deploy frontends

Create **two** Vercel projects (website + admin) from the same GitHub repo. A third Vercel project for POS is optional emergency fallback only — cashiers use the local shop till.

### A) Website

| Setting | Value |
|---------|--------|
| Root Directory | `website` |
| Framework | Next.js |
| Build | `npm run build` |
| Output | Next default |

Env:

```text
NEXT_PUBLIC_API_URL=https://YOUR-API.onrender.com/api/v1
NEXT_PUBLIC_APP_NAME=Musa Cafe
```

### B) Admin

| Root Directory | `admin` |

Env:

```text
NEXT_PUBLIC_API_URL=https://YOUR-API.onrender.com/api/v1
NEXT_PUBLIC_POS_URL=https://YOUR-POS.vercel.app
NEXT_PUBLIC_APP_NAME=Musa Cafe Admin
```

### C) POS (optional cloud fallback)

Cashiers at the shop should use the **local** production POS, not this Vercel URL, for daily work:

1. Copy the repo onto the shop PC  
2. Run `pos\scripts\Setup-Local-POS.bat`  
3. Double-click the **Musa Cafe POS** desktop shortcut  

See [`pos/docs/LOCAL-POS-PHASE-1.md`](./pos/docs/LOCAL-POS-PHASE-1.md).

A Vercel POS project is optional as an emergency remote fallback (`pos\scripts\Launch-POS.bat`). If you still deploy it:

| Root Directory | `pos` |

Env:

```text
NEXT_PUBLIC_API_URL=https://YOUR-API.onrender.com/api/v1
NEXT_PUBLIC_APP_NAME=Musa Cafe POS
```

**Important:** `NEXT_PUBLIC_*` is baked in at **build** time. After changing API URL, **redeploy** each frontend.

If `website` or `pos` fail to build because of `shared/menu.json`:

- In Vercel → Project → Settings → General → ensure the monorepo root is the Git repo root and Root Directory is `website` / `pos` (parent `shared/` must be readable). The Next `turbopack.root` already points at the monorepo parent for those apps.

---

## 5. CORS / HTTPS

- Backend already allows browser calls from any origin (`*`) with Bearer tokens.  
- Vercel and Render terminate HTTPS for website, admin, API, and optional cloud POS. The shop till on `127.0.0.1` does not need a public certificate.

---

## 6. Custom domains (optional)

### Vercel (website / admin; optional cloud POS)

1. Project → Settings → Domains → add domain  
2. Add the DNS records Vercel shows (CNAME or A)  
3. Wait for SSL “Valid”

### Render (API)

1. Service → Settings → Custom Domain  
2. Add `api.yourdomain.com`  
3. Add CNAME to your Render hostname  
4. SSL provisions automatically  

Then update website, admin, shop `pos/.env.local` (rerun setup or rebuild), and the optional Vercel POS if you still use it:

```text
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
```

and redeploy.

---

## 7. Production smoke test

1. Open website → menu loads from API  
2. Place a guest order  
3. Admin login → analytics / products / settings save  
4. POS login on the **shop PC shortcut** → pending/history work from IndexedDB; internet is for login/sync  
5. Settings phone/address appear on website footer  

---

## 8. Free-tier limits (expect these)

| Service | Behavior |
|---------|----------|
| Render free | API **sleeps** after idle; first request can take 30–60s |
| Neon free | Storage / compute limits; fine for demos |
| Vercel hobby | Bandwidth / build minutes limits |

For fewer API sleeps later: Railway trial or Render paid starter.

---

## 9. Local development (unchanged)

```bash
# Postgres local + backend/.env with DB_* and APP_PORT=8080
cd backend && go run ./cmd/server

cd website && npm run dev    # :3000
cd pos && npm run dev        # :3001
cd admin && npm run dev      # :3002
```

---

## 10. Environment cheat sheet

### Backend (Render)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes (cloud) | Neon/Supabase URL |
| `JWT_SECRET` | Yes | ≥ 16 chars |
| `PORT` | Auto | Prefer platform value |
| `APP_PORT` | Local only | Default 8080 |
| `DB_*` | Local alt | Used if no `DATABASE_URL` |
| `CLOUDINARY_*` | No | Optional |
| `WHATSAPP_TOKEN` | No | Meta Cloud API bearer token (order alerts) |
| `WHATSAPP_PHONE_NUMBER_ID` | No | Meta WhatsApp phone number ID |
| `WHATSAPP_OWNER_PHONE` | No | Owner phone(s), comma-separated, e.g. `92300…`. Website orders also always notify `923000128562` (03000128562). |

### Frontends (Vercel)

| Variable | Apps |
|----------|------|
| `NEXT_PUBLIC_API_URL` | website, admin, pos (cloud fallback) |
| `NEXT_PUBLIC_POS_URL` | admin |
| `NEXT_PUBLIC_APP_NAME` | optional |

Shop local POS uses the same `NEXT_PUBLIC_API_URL` written into `pos/.env.local` by `Setup-Local-POS.bat`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Frontend calls localhost | Set `NEXT_PUBLIC_API_URL` then rebuild (shop: `Setup-Local-POS.bat`; website/admin: Vercel redeploy) |
| API 502 / cold start | Wait and retry; Render free sleeps |
| DB auth failed | Check Neon URL encoding of password special chars |
| Settings save 500 | Ensure latest backend (WhatsApp column fix) is deployed |
| Build can’t find `shared/` | Confirm Root Directory and monorepo layout on Vercel |
| POS won’t install as PWA | Cloud fallback only; shop till uses the desktop Chrome app shortcut |
| Offline POS duplicates orders | Redeploy API so `client_order_id` unique column exists |

---

## POS offline-first docs

Full production documentation (architecture, sync, IndexedDB, offline workflows, security, readiness):

→ [`pos/docs/PRODUCTION.md`](./pos/docs/PRODUCTION.md)

After deploying POS + API together:

1. Login online once (warms IndexedDB)
2. Airplane mode: create/complete cash orders
3. Reconnect: sidebar “to sync” returns to 0
4. Confirm Admin/history shows each order once

---

## What we prepared in the repo

- `backend/internal/config` — `PORT`, optional Cloudinary, `DATABASE_URL`
- `GET /health` and `GET /api/v1/health`
- `backend/Dockerfile` + `backend/render.yaml`
- Sanitized `backend/.env.example` + frontend `.env.example` files
- POS offline-first foundation + sync engine (`pos/docs/PRODUCTION.md`)
