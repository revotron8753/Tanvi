# Database

PostgreSQL + Prisma 7 (driver adapter `@prisma/adapter-pg`). Schema: `packages/database/prisma/schema.prisma`. Migrations are SQL files in `prisma/migrations`; production uses `prisma migrate deploy` only.

## Phase 1 tables
Identity: User, Role, Permission, UserRole, RolePermission, Session, MfaRecoveryCode, AuditLog, RateLimitBucket · Catalogue: Category, Product, ProductImage, ProductVariant · Inventory: StockLocation, InventoryBalance, InventoryMovement · Platform: IdempotencyRecord.
Customers, orders, payments, messaging, try-on and kiosk tables arrive with their phases (ADR D10).

## Invariants enforced by the database (migration SQL)
- `InventoryBalance`: `onHand >= 0`, `reserved >= 0`, `reserved <= onHand`. Available = `onHand - reserved`, always derived.
- Unique `(variantId, locationId)`; unique SKU; unique `(productId, size, colour)`.
- Money columns are integer paise with non-negative checks; compare-at price ≥ price; GST in basis points (0–10000), nullable until the business supplies rates.
- One primary image per product (partial unique index).
- `InventoryMovement` is append-only (trigger rejects UPDATE/DELETE). Consequence: products whose variants have ledger rows cannot be hard-deleted; archive them.

## Seed (`npm run db:seed`, idempotent)
Six categories, permissions, six roles with the proposed matrix, default location `MAIN`. Uses upsert-with-empty-update, so re-running never overwrites admin edits or revokes permissions an owner added. Sample/fixture data is not seeded.

## Reserving stock safely
`UPDATE "InventoryBalance" SET reserved = reserved + :q WHERE ... AND onHand - reserved >= :q` and check the affected row count. A test fires 20 concurrent reservations against 5 units and asserts exactly 5 succeed.

## Dev
`npm run db:dev` runs a project-local PostgreSQL (embedded-postgres) on 54329 with databases `tanvi` and `tanvi_test`. Creating a migration: `cd packages/database && DATABASE_URL=... npx prisma migrate dev --name <name>`.
