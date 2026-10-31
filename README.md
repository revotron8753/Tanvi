# Tanvi

Premium Indian ethnic-fashion platform: storefront, admin studio, in-store AI mirror. Source of truth: [docs/SPEC.md](docs/SPEC.md). Agent rules: [CLAUDE.md](CLAUDE.md).

## Status

| Phase | Scope | State |
|-------|-------|-------|
| 1 | Repo, architecture, design system, database, staff authentication | **Built, verified** (see docs/TESTING.md) |
| 2 | Catalogue, image upload, categories, variants, inventory | **Built, verified** (local-disk image storage only; S3 driver pending provider choice) |
| 3 | Storefront | **Built, verified** (wishlist/cart are anonymous cookie-based; customer accounts not built) |
| 4 | Cart, checkout, payments, orders | **Built. Razorpay adapter written from official docs and tested only against a local double; NOT verified with real credentials** |
| 5 | WhatsApp ordering, notifications, webhooks, social | **Partly built.** Staff-created WhatsApp orders and a notification outbox (retries, consent rules, test-mode allow-list) work. **No provider is connected, so nothing is sent.** Inbound webhooks, delivery status and social are not built. |
| 6 | AI try-on, kiosk, QR handoff, cleanup | **Partly built.** Kiosk screens, device registration, consent records, session isolation, job state machine, caps, QR handoff and the retention sweeper work. **No AI service is connected, so every try-on fails with a clear message.** No adapter; online try-on is "not available". |
| 7 | Reporting, hardening, deployment | **Partly built** (reports, dashboard, audit log, axe accessibility tests, deployment/operations docs). Not done: nonce-based CSP, load testing, backups drill, S3 storage. |

No integration (WhatsApp, payments, AI try-on, courier) exists yet, so none is claimed to work.

## Setup

Requires Node 22+ and npm. No Docker or system PostgreSQL needed for development.

```bash
npm install
npm run db:dev                      # terminal 1: project-local PostgreSQL on :54329 (data in .pgdata/)
cp .env.example apps/web/.env       # then fill in values; generate keys with openssl (see file)
export DATABASE_URL="postgresql://tanvi:tanvi_dev_only@localhost:54329/tanvi"
npm run db:migrate                  # apply migrations
npm run db:seed                     # categories, permissions, roles, default stock location (idempotent)
BOOTSTRAP_ADMIN_EMAIL=you@example.com BOOTSTRAP_ADMIN_PASSWORD='a long temporary passphrase' \
  npm run create-super-admin -w @tanvi/web
npm run dev                         # http://localhost:3000/admin/login
```

The dev database credentials are throwaway and local only. Never reuse them anywhere else.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | `tsc` in every workspace |
| `npm run lint` | ESLint (no `any`, module boundaries) |
| `npm test` | Vitest unit + integration (DB tests need `DATABASE_URL_TEST`) |
| `npm run test:e2e` | Playwright against a production build |
| `npm run db:migrate` / `db:seed` | Migrations / idempotent seed |

Docs: [ARCHITECTURE](docs/ARCHITECTURE.md) · [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) · [DATABASE](docs/DATABASE.md) · [SECURITY](docs/SECURITY.md) · [TESTING](docs/TESTING.md) · [PHASE1_PLAN](docs/PHASE1_PLAN.md).
