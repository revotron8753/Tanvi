# API and server-action conventions

There is no public REST API. The browser talks to the server through React Server Actions and a few route handlers.

## Route handlers
| Route | Caller | Authentication |
|---|---|---|
| `GET /media/[...key]` | public | none. Only fixed rendition names; draft/archived product images and unpublished category images require a signed-in staff session with `products.read`. |
| `POST /api/webhooks/razorpay` | Razorpay | HMAC-SHA256 of the raw body vs `X-Razorpay-Signature`; dedupe on `x-razorpay-event-id`. 404 when payments are not configured, 400 on a bad signature. |
| `POST /api/cron/expire-orders` | scheduler | `Authorization: Bearer $CRON_SECRET` (timing-safe). |
| `GET /admin/products/export`, `GET /admin/reports/export` | staff | `requireAdmin(permission)`; CSV with formula-injection neutralised; PII columns only with `customers.export`. |
| `GET /sitemap.xml`, `/robots.txt` | public | none |

## Server actions
Public (shopper): `features/shop/actions.ts` (cart, wishlist, newsletter), `features/checkout/actions.ts` (place order, verify payment, retry). They never import admin guards or admin services (tested).
Staff: everything else under `features/**/actions.ts`, each calling `requirePermissionForAction(permission)` first (tested structurally).

## Conventions
- Actions return `{ ok?: string; error?: string }`; errors are safe, user-facing text (no provider payloads, no stack traces).
- All money is integer paise; amounts typed by people are rupees parsed with `parseRupeesToPaise` (no floats).
- Every price, discount, tax, shipping and total is computed on the server (`orders/pricing.ts`); forms carry no numeric totals.
- Lists are paginated (products 20, orders 25, inventory 25, storefront 12).
