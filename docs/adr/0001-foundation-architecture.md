# ADR-0001: Foundation architecture and stack

- Status: **Proposed** (pending review)
- Date: 2026-10-29
- Deciders: project owner (review), coding agent (proposal)
- Context source: `docs/SPEC.md` §0, §5, §6, §17, §19

## Context

Tanvi is one catalogue and one source of truth serving a storefront, an admin studio and an in-store kiosk. The repository is empty, so there is no existing code or convention to preserve. The team is small and store staff are non-technical. Several external integrations (WhatsApp provider, AI try-on, courier) are undefined, and the spec forbids inventing their contracts. Money, inventory consistency and personal images (DPDP Act) are the highest-risk areas.

## Decisions

### D1. Modular monolith in a single deployable
One Next.js application serves storefront, admin, kiosk and API route handlers. Domain logic lives in separate workspace packages with explicit boundaries; UI and route handlers call domain services, never the database directly. A background worker (same codebase, separate process) is added in Phase 4/5 for outbox, reservation expiry and the image sweeper.
- *Why:* SPEC §0/§5 and CLAUDE.md prohibit microservices; one transaction boundary makes inventory and order consistency simple.
- *Alternatives rejected:* microservices (no demonstrated need); separate API server (extra deploy and auth surface for no gain now).
- *Consequence:* module boundaries must be enforced by lint rules (import restrictions), or the monolith decays.

### D2. npm workspaces monorepo
Layout follows SPEC §23: `apps/web`, `packages/{database,domain,validation,config,ui}`; `integrations/` is added when Phase 5/6 begin.
- *Why:* npm is already installed (11.6); pnpm is not. Avoids an extra install step for the owner.
- *Alternative:* pnpm (better hoisting and disk use). Easy to migrate later; revisit if install time or phantom dependencies become a problem.

### D3. PostgreSQL + Prisma, migrations only
Prisma schema in `packages/database`, SQL migrations committed, `prisma migrate deploy` in production, no `db push` outside throwaway local use. Invariants that the ORM cannot express (non-negative stock, `reserved <= onHand`) are enforced with `CHECK` constraints in migrations.
- *Why:* SPEC §5/§6; DB-level constraints are the last line of defence against overselling.
- *Consequence:* inventory writes use atomic conditional updates or row locks (`UPDATE … WHERE onHand - reserved >= qty`), via `$transaction` / raw SQL where Prisma's API is insufficient. Prisma Client is imported only inside `packages/database` and domain services.

### D4. Money as integer paise
All monetary columns and domain values are integers in paise. Formatting to `₹1,23,456` happens only at the presentation edge. A `Money` helper rejects non-integers. Whether a column should be `Int` or `BigInt` is decided at schema review (see plan 1.3).
- *Why:* CLAUDE.md "no floats for money".
- *Tax:* GST rate is nullable on products until the business supplies it; order lines will snapshot the applied rate (Phase 4). Inclusive/exclusive pricing is a business setting, not a code constant.

### D5. Inventory keyed by (variant, location) from day one
`StockLocation` + `InventoryBalance(variantId, locationId)` + append-only `InventoryMovement`. One default location is seeded. Available quantity is derived (`onHand - reserved`) and never stored.
- *Why:* SPEC §6/§9: a second store or warehouse should be configuration, not a migration.

### D6. Staff authentication: self-managed, DB-backed sessions
Email + password (Argon2id), opaque session tokens stored hashed in `Session`, HttpOnly/Secure/SameSite cookies, TOTP MFA, rate limiting, CSRF checks, permission-based authorisation through one server-side guard. Roles and permissions are data (`Role`, `Permission`), seeded, and checked by permission, not role name.
- *Why:* server-side revocation, a full audit trail, no third-party dependency for a handful of staff accounts, and no cost or vendor decision pending.
- *Alternatives:* Auth.js (more moving parts for credentials + MFA + DB sessions; designed around OAuth); hosted provider such as Clerk/Auth0 (cost, vendor lock-in, data residency question for an Indian business, not yet decided by owner). Reversible: the guard interface is the seam.
- *Scope:* staff only in Phase 1. **Customer authentication is a separate, later decision** (OTP channel depends on unresolved email/WhatsApp inputs). Kiosk devices use their own revocable device credentials (Phase 6), never staff or customer sessions.

### D7. Validation and shared types
Zod schemas in `packages/validation` are the single source for request validation and inferred types, shared by server and client. `any` is a lint error. Env variables are parsed through a typed Zod loader that fails fast at boot and never logs values.

### D8. Design tokens as CSS variables behind a Tailwind preset
Brand colours, type, spacing, radius, shadow and state tokens live in `packages/ui`. Components consume tokens, never raw hex. A scripted WCAG AA contrast check gates which token pairs may be used for text.
- *Why:* three surfaces (storefront, admin, kiosk) must share identity; SPEC §3 requires AA checking of light tokens.

### D9. Testing approach
Vitest for unit and integration (real Postgres for DB tests; no mocking the database for constraint or concurrency tests), Playwright for end-to-end. Provider adapters are mocked in automated tests and kept separate from any sandbox testing (SPEC §18). A test asserts every admin route and action is permission-guarded.

### D10. Schema is built incrementally
Phase 1 migrates only identity, catalogue, inventory and platform tables. Later phases add orders, payments, messaging, try-on and kiosk tables in their own migrations.
- *Why:* the integration-dependent models (WhatsApp, try-on) would otherwise be guessed, which the spec forbids.
- *Consequence:* the full entity list in SPEC §6 is delivered over phases, not in migration 1.

## Consequences

Positive: simple deployment and transactions, strong DB-level safety on stock, no invented integration shapes, small dependency footprint for auth.
Negative / costs: we own security-sensitive auth code (needs careful review and tests); monolith boundaries need lint enforcement; workspace tooling adds some setup; npm instead of pnpm may need a later migration.

## Open items affecting this ADR
Hosting target, object storage, and email provider (OPEN_QUESTIONS, Infrastructure) do not change D1–D10 but constrain later ADRs. Planned follow-ups: ADR for object storage and image pipeline (Phase 2), payments and order state machine (Phase 4), outbox and webhook handling (Phase 5), AI job state machine and retention (Phase 6).
