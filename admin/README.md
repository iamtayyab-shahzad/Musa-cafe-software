# Krunchies Admin

Next.js 15 admin dashboard for Krunchies Pizza.

## Run

```bash
cd admin
npm install
npm run dev
```

App runs on **http://localhost:3002**

## Mock login

| User | Password | Result |
|------|----------|--------|
| `admin` | `admin@admin` | Admin dashboard |
| `staff` | `staff@54321` | Redirects to POS (`NEXT_PUBLIC_POS_URL`, default `http://localhost:3001`) |

POS staff login is unchanged — this admin login only routes staff to the existing POS app.

## Notes

- Mock data only (no backend yet)
- Design language matches POS (black / zinc / orange)
