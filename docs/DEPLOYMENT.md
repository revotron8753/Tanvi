# Deployment (draft: hosting target not chosen, see OPEN_QUESTIONS)

## Requirements
Node 22+, PostgreSQL 15+ (managed recommended), a persistent location for uploaded images, a trusted reverse proxy (TLS termination) in front of the app.

## Environment (see `.env.example`)
Required: `DATABASE_URL`, `APP_ENCRYPTION_KEY`, `APP_HASH_SECRET`, `SITE_URL` (public origin). Optional: `RAZORPAY_*`, `CRON_SECRET`, `STORAGE_LOCAL_DIR`, session timeouts.
Never set `RAZORPAY_API_BASE_URL` in production.

## Steps
1. `npm ci && npm run generate -w @tanvi/database`
2. `DATABASE_URL=… npm run db:migrate` (applies SQL migrations; never `prisma db push`)
3. `DATABASE_URL=… npm run db:seed` (idempotent: categories, roles, location)
4. First Super Admin: `BOOTSTRAP_ADMIN_EMAIL=… BOOTSTRAP_ADMIN_PASSWORD=… npm run create-super-admin -w @tanvi/web`, then sign in and enrol MFA.
5. `npm run build && npm run start -w @tanvi/web`
6. Configure the Razorpay webhook and the cron call (see INTEGRATIONS.md).

## Known blockers for production
- **Image storage is local disk.** It needs a persistent volume on a single instance. Serverless or multi-instance hosting needs an S3-compatible driver (not written; provider not chosen).
- CSP allows inline scripts (tighten to nonces).
- The reverse proxy must overwrite `X-Forwarded-For`, or rate limiting can be spoofed.
- Razorpay integration unverified with live/test credentials.

## Backups
Back up PostgreSQL (daily snapshots + point-in-time recovery where available) and the uploads directory. Restore drill: restore into a scratch DB, run `npm run db:migrate` (no-op if current), start the app against it, check an order and an image. Not yet exercised.
