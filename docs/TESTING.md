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
