# Krunchies Backend

Gin + GORM + PostgreSQL API for the Krunchies restaurant system.

## Run

```bash
# from backend/
go run ./cmd/server
```

Health: `GET http://localhost:8080/`  
Swagger UI: `http://localhost:8080/swagger/index.html`  
OpenAPI: `http://localhost:8080/openapi.yaml`

## Seed staff user

```bash
go run ./cmd/seed
```

Default credentials:
- Admin: `admin` / `admin@admin`
- Staff (POS): `staff` / `staff@54321`

## Import the Krunchies menu

Populates categories, products, product sizes and offers from the canonical
`shared/krunchies-menu.json`. The command is idempotent (upsert by deterministic
UUID) so it is safe to re-run — existing rows are updated, never duplicated.

```bash
# from backend/
go run ./cmd/importmenu

# also remove non-menu (demo) rows that are not referenced by any order
go run ./cmd/importmenu -prune
```

## Auth

- `POST /api/v1/auth/staff/login`
- `POST /api/v1/auth/customers/register`
- `POST /api/v1/auth/customers/login`

Staff JWT required for catalog, inventory, payments, analytics, and order management.

## Orders

Public create (guest checkout supported):

- `POST /api/v1/orders` (website/guest)
- `POST /api/v1/orders/phone`
- `POST /api/v1/orders/walkin`

Staff:

- `GET /api/v1/orders`
- `GET /api/v1/orders/pending`
- `GET /api/v1/orders/phone`
- `GET /api/v1/orders/walkin`
- `GET|PUT|DELETE /api/v1/orders/:id`
- `PATCH /api/v1/orders/:id/complete` (consumes inventory via recipes + inventory transactions)
- `PATCH /api/v1/orders/:id/cancel`

Prices, delivery charges, and COD fees are calculated server-side.
