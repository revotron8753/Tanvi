# Architecture

Modular monolith (ADR: [0001](adr/0001-foundation-architecture.md)). One Next.js app serves storefront, admin and kiosk; domain code is in workspace packages.

```
apps/web                 Next.js App Router (storefront, /admin, /kiosk later)
  src/server/auth        Auth service (framework-free, DB-tested) + guard (cookies, redirects, 403)
  src/features/auth      Server actions and client forms
  src/components/ui      Design-system components (no DB access; lint-enforced)
packages/database        Prisma schema, migrations, seed, client factory
packages/domain          Money (integer paise), permission keys, default role matrix
packages/validation      Shared Zod schemas (populated from Phase 2)
packages/ui              Design tokens + contrast utilities (tested)
tests/                   Integration tests (real PostgreSQL)
```

Rules enforced mechanically: no `any`; UI components cannot import the DB; every admin page/action must call the guard (structural test); client components cannot import server code.

Auth flow: `login` → opaque session token (hashed in DB) in an HttpOnly cookie → `requireAdmin(permission)` on every page/action. Layouts are deliberately not guards.

Known deviations from the spec's suggested layout: `packages/config` and `packages/integrations` are not created yet (no content until Phase 4–6).

## Catalogue module (Phase 2)
`server/catalog/*` is framework-free and DB-tested: `products.ts` (CRUD, publish rules, variants, images, listing), `inventory.ts` (the only writer of stock), `images.ts` (decode-validate and re-encode to WebP renditions; strips EXIF), `categories.ts`, `csv.ts`/`import.ts`. `server/storage` is the object-storage port (local-disk driver). `/media/[...key]` serves only fixed rendition names; draft/archived product images are visible only to signed-in staff with `products.read`.
