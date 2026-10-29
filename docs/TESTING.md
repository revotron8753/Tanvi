# Testing

| Layer | Tool | Where |
|---|---|---|
| Unit | Vitest | `packages/*/src/*.test.ts`, `apps/web/src/**/*.test.ts` |
| Integration (real PostgreSQL) | Vitest | `tests/integration/` |
| End-to-end (production build, real browser) | Playwright | `apps/web/e2e/` |

DB-backed tests need `DATABASE_URL_TEST` (database name must contain "test"); they are skipped otherwise. Migrations are applied automatically before the run.

```bash
export DATABASE_URL_TEST="postgresql://tanvi:tanvi_dev_only@localhost:54329/tanvi_test"
npm run typecheck && npm run lint && npm test
export E2E_ENCRYPTION_KEY="$(openssl rand -base64 32)"
npm run test:e2e        # first time: npx playwright install chromium
```
Provider adapters (Phase 4+) are mocked in automated tests; real sandbox calls stay in a separate, clearly named suite.

## What is covered (see `tests/integration/*`, `apps/web/e2e/*`)
Money/GST/discount math (unit); Razorpay adapter and signatures (unit, documented algorithm); auth, lockout, MFA, sessions; catalogue, variants, images, CSV import; stock ledger and concurrent reservation; cart rules; order placement, duplicate/late/mismatched payments, cancellation and restock, COD flow, invoices, coupons, snapshots, token-gated confirmation; reports; admin authorisation coverage; end-to-end storefront, checkout (signed webhooks against a local Razorpay double), admin workflows, security headers; axe WCAG 2.1 A/AA on key pages.

## Not covered / not possible yet
Real Razorpay calls; real browser payment widget; WhatsApp; AI try-on; kiosk; load/performance tests; visual regression.
E2E needs `E2E_ENCRYPTION_KEY` and `DATABASE_URL_TEST`; it builds and starts the production server on port 3100 and a fake Razorpay on 3199. The test DB accumulates data across runs by design (tests do not rely on it being empty).
