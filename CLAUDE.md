# Tanvi — agent rules

Read `docs/SPEC.md` before doing any work. It is the source of truth. Check `docs/OPEN_QUESTIONS.md` for inputs that are still missing.

## How to work
- Work on **one phase at a time** (SPEC §21). Plan first, wait for review, then build.
- Before you call a step done, run: type check → lint → relevant tests. Report the actual results.
- Commit after each coherent, verified change.
- Keep `docs/OPEN_QUESTIONS.md` and the other docs up to date as you go.
- When I ask for changes, give me only the files that changed, not the whole project.

## Never
- Invent WhatsApp, AI try-on, payment or courier API endpoints, payloads, auth or webhook signatures. If the docs are missing, stop and add the gap to OPEN_QUESTIONS.
- Claim an integration works until a real configured call has passed.
- Fake success: no mock data in production code, no simulated responses, no placeholder buttons.
- Put secrets in code, client bundles, logs or commits.
- Use floats for money. Use integer paise.
- Trust client-submitted totals. The server recalculates everything.
- Hardcode category names. Read them from the DB.
- Create a confirmed order just because someone clicked a WhatsApp link.
- Use `any`, call the DB from UI components, or produce one giant unverified code dump.

## Defaults
- Next.js App Router, strict TypeScript, Tailwind, Prisma + PostgreSQL, Zod, Vitest + Playwright.
- Modular monolith. No microservices or Kubernetes.
- Authorisation is enforced on the server for every admin and API action.
- Inventory is tracked per (variant, location), and all changes are transactional.
- Customer images are temporary, deleted per the retention policy, and require recorded consent (DPDP Act).
