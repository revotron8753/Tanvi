# Phase 1 plan — foundation

Status: **draft, awaiting review**. No code has been written.
Scope per SPEC §21: repository inspection, architecture, design system, database, authentication.

## 1. Repository inspection (done)

| Item | Finding |
|------|---------|
| Project contents | Empty. Only `CLAUDE.md`, `docs/SPEC.md`, `docs/OPEN_QUESTIONS.md`. No code, lockfile, env files, or existing integrations to preserve. |
| Git | `/Users/fyxospaces/Tanvi` is **not its own repo**. The enclosing repo is the home directory (`/Users/fyxospaces`, branch `master`, no commits, everything untracked). Committing from here would target that repo. See Q1. |
| Toolchain | Node v24.10.0, npm 11.6.0. **No** pnpm, psql, or Docker installed. |
| Database | No PostgreSQL available locally. Need a way to run one (Q2). |
| Stack | Greenfield, so SPEC §5 applies as written. |

## 2. Confirmed requirements vs assumptions

**Confirmed (from SPEC / CLAUDE.md):** Next.js App Router, strict TS, Tailwind, Prisma + PostgreSQL, Zod, Vitest + Playwright, modular monolith, integer paise, inventory per (variant, location), server-side authorisation, categories from DB via idempotent seed, brand tokens in §3, migrations only (no auto-sync).

**Assumptions (flagged, change on review):**
- A1. npm workspaces rather than pnpm (nothing extra to install). See ADR D2.
- A2. Phase 1 authentication covers **staff/admin only**. Customer auth is deferred (needs an email or WhatsApp channel for OTP, both unresolved).
- A3. Phase 1 migrates only the tables Phase 1 and 2 need. Later phases add theirs.
- A4. Fonts: Cormorant Garamond + DM Sans as working defaults (open question, 🟢), swappable via tokens.
- A5. Local dev uses a Postgres I can reach without Docker (Q2).

## 3. Steps

Each step ends with: type check → lint → relevant tests, results reported, then one commit. I stop for review at the end of the phase, and I will mention it if a step needs an earlier check-in.

### 1.1 Repo bootstrap
- `git init` in `Tanvi/` (pending Q1), `.gitignore`, `.editorconfig`, `.nvmrc`.
- npm workspaces: `apps/web`, `packages/{database,domain,validation,config,ui}`. Create integrations/ later, when Phase 5/6 need it.
- Next.js (App Router), strict TS (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESLint with `no-explicit-any` as error, Prettier, Vitest, Playwright installed with one smoke test.
- Pinned versions, committed lockfile.
- `.env.example` with purpose and required/optional per variable, plus a typed env loader (Zod) that fails fast and never prints values.
- Scripts: `typecheck`, `lint`, `test`, `test:e2e`, `db:migrate`, `db:seed`.
- CI workflow (GitHub Actions): install, typecheck, lint, test, with a Postgres service. Needs a GitHub remote (Q1).

### 1.2 Design system
- `packages/ui` + Tailwind preset: tokens as CSS variables for colour (8 brand tokens), type scale, spacing, radius (small, per "avoid overly rounded"), borders, shadows, focus ring, component states.
- **Contrast audit** computed, not eyeballed: script that checks every text/background token pair against WCAG 2.1 AA (4.5:1, 3:1 large). Expect Sand/Taupe to fail as text on Ivory; the result is recorded in `docs/DESIGN_SYSTEM.md` and the failing pairs are blocked for text use.
- Base components needed by admin login and Phase 2: Button, Input, Select, Checkbox, Label/FieldError, Card, Table, Dialog, Toast, Badge, Skeleton. Accessible by construction (Radix primitives or native elements; decided in step).
- Three layouts: storefront shell, admin shell, kiosk shell (empty, no site chrome). Shells only; no storefront pages.
- Indian price formatter (`₹1,23,456`) from paise, with unit tests.
- `docs/DESIGN_SYSTEM.md`.

### 1.3 Database
Prisma schema + first migrations for:
- **Identity/access:** `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `Session`, `AuditLog`.
- **Catalogue:** `Category`, `Product`, `ProductImage`, `ProductVariant`.
- **Inventory:** `StockLocation`, `InventoryBalance`, `InventoryMovement`.
- **Platform:** `IdempotencyRecord` (used from Phase 4; cheap to add now).

Constraints worth stating:
- Money columns are `Int` paise (`BigInt` if a total could exceed ~₹2 crore; to confirm in review). Never `Float`/`Decimal`.
- `InventoryBalance` unique on `(variantId, locationId)`; `CHECK (onHand >= 0)`, `CHECK (reserved >= 0)`, `CHECK (reserved <= onHand)`. Available is derived (`onHand - reserved`), not stored.
- `InventoryMovement` is append-only (type, delta, reason, actor, reference).
- `ProductVariant.sku` globally unique; unique `(productId, size, colour)`.
- `Category.slug`, `Product.slug` unique; FKs everywhere; indexes on slug, status, categoryId, foreign keys.
- Product holds status (`DRAFT | PUBLISHED | ARCHIVED`), HSN code, GST rate **nullable until configured** (no invented rates; see OPEN_QUESTIONS tax section).
- Seed (idempotent, upsert by slug): the six categories, the six staff roles with a permission matrix, and one default `StockLocation`. Seeded role matrix is a **proposal** for review; the Super Admin user is created via a one-off CLI using env-supplied credentials, never from a hardcoded password.
- Dev/test fixtures (sample products) live in a clearly named `fixtures/` directory, imported only by tests and an explicit `db:seed:dev` script that refuses to run when `NODE_ENV=production`.
- Tests: migration applies on empty DB; seed run twice yields identical state; constraint tests (negative stock rejected, duplicate SKU rejected).
- `docs/DATABASE.md`.

Deferred to the phase that needs them: customers/addresses/consent, cart, wishlist, orders, payments, shipments, returns, messaging, try-on, kiosk devices, webhook events.

### 1.4 Authentication and authorisation (staff)
- Email + password; **Argon2id** hashing; DB-backed sessions with opaque random tokens stored hashed; `HttpOnly`, `Secure`, `SameSite=Lax` cookie; idle and absolute expiry; rotation on login; revoke-all on password change.
- Login rate limiting and lockout/backoff; generic error messages (no user enumeration).
- CSRF protection on state-changing requests (Origin check + token for form posts).
- TOTP MFA: enrolment, verification, recovery codes; enforceable per role (proposal: required for Super Admin, optional for others at launch; Q4).
- Authorisation: permission-based `requirePermission()` guard in a single server module, used by every route handler and server action. A test enumerates all admin routes/actions and fails if one lacks a guard.
- Audit log entries for login success/failure, MFA changes, role changes.
- Security headers (CSP, HSTS, X-Content-Type-Options, frame protections, Referrer-Policy) via Next middleware/config, tested.
- Pages: `/admin/login`, `/admin` (empty authorised shell showing the user and role), `/admin/users` (list/create/disable/assign role — Super Admin only).
- Tests: unit (hashing, token, expiry), integration (login, lockout, revoked session, permission denial per role), Playwright (login → shell → logout; unauthorised role gets 403 server-side, not just hidden nav).
- `docs/SECURITY.md` (initial threat model for the auth surface).

### 1.5 Documentation and close-out
`README.md`, `docs/ARCHITECTURE.md` (links ADR-0001), `DESIGN_SYSTEM.md`, `DATABASE.md`, initial `SECURITY.md`, `TESTING.md`; update `OPEN_QUESTIONS.md`; record limitations.

## 4. Phase 1 exit criteria
- `typecheck`, `lint`, unit/integration and the Playwright smoke + auth tests all pass; actual output reported.
- Fresh clone → documented steps → migrated, seeded, running app with a working admin login.
- Seed idempotent; six categories read from DB, none hardcoded in UI.
- Every admin route/action denies unauthenticated and under-privileged requests server-side (tested).
- No secrets in repo, logs or client bundle (grep check plus env-loader test).
- Docs updated; remaining limitations listed.

## 5. Explicitly out of Phase 1
Product CRUD, image upload and object storage, storefront pages, customer accounts, cart/checkout/payments, WhatsApp, AI try-on, kiosk. Phases 5 and 6 stay blocked on OPEN_QUESTIONS.

## 6. Risks
- No Postgres or Docker on this machine: DB-backed tests cannot run until Q2 is answered.
- Home-directory git repo: risk of committing the wrong tree (Q1).
- GST rates and HSN codes unknown: columns stay nullable; nothing computes tax in Phase 1.
- Contrast: several brand tokens are expected to fail as text colour; design must use Cocoa/Espresso for text.

## 7. Questions I need answered before building
See "Phase 1 review questions" in `docs/OPEN_QUESTIONS.md` (Q1–Q6). Q1 and Q2 block step 1.1/1.3; the rest have stated defaults I will use unless told otherwise.
