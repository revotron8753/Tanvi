# Integrations

Rule: nothing below is "live" until a real, configured call has passed. Status is stated per integration.

## Razorpay (payments): written, NOT verified with real credentials
- Contract used (from Razorpay's official docs, checked 2026-10-29): `POST https://api.razorpay.com/v1/orders` with HTTP Basic (key id : secret), integer paise, `currency`, `receipt` (≤ 40 chars, unique); a new Razorpay order per payment attempt; Checkout success returns `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`; signature = HMAC-SHA256 hex of `<our stored order id>|<payment id>` with the key secret; webhooks: `X-Razorpay-Signature` = HMAC-SHA256 hex of the raw body with the webhook secret, `x-razorpay-event-id` unique per event, events `payment.captured` / `payment.failed`.
- Code: `apps/web/src/server/payments/razorpay.ts` (adapter), `orders/service.ts` (`startPayment`, `markPaid`, `markPaymentFailed`), `app/api/webhooks/razorpay/route.ts`, `features/checkout/*`.
- Tests: unit tests for the adapter (mock fetch, documented signature algorithm); integration tests for duplicate/late/mismatched payments; e2e against a local test double of the Orders API with correctly HMAC-signed webhooks.
- **Not verified:** a real call to Razorpay (order creation, Checkout widget opening and paying, real webhook delivery). Required: test-mode key id/secret and a webhook secret.
- **Unverified assumption:** the Content-Security-Policy origins allowed on `/checkout/pay/*` (`checkout.razorpay.com` script, `api.razorpay.com`/`checkout.razorpay.com` frames, `*.razorpay.com` connect/img/form). Razorpay does not publish an official list that I could find. Test in a browser with real test keys and adjust.
- Not implemented (no verified docs read yet): refunds API, payment links for WhatsApp orders, reconciliation job. Refunds are recorded manually: staff refund in the Razorpay dashboard, then record the reference on the order.

### Setup
1. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
2. In the Razorpay dashboard add webhook `https://<site>/api/webhooks/razorpay` with events `payment.captured` and `payment.failed`, using the same secret.
3. Schedule `POST /api/cron/expire-orders` every few minutes with `Authorization: Bearer $CRON_SECRET` (releases stock held by abandoned checkouts; checkout also does this opportunistically).
`RAZORPAY_API_BASE_URL` exists only for test doubles; never set it in production.

## Not started (blocked on provider documentation/credentials): see OPEN_QUESTIONS
WhatsApp Business API, AI try-on API, courier/shipping, email provider, object storage (S3-compatible driver).

## WhatsApp: outbox built, provider NOT connected
- Built: `OutboxMessage` (durable queue + delivery log), `enqueueOrderEvent` (called after each order event is committed; idempotent per order+event), `processOutbox` (SKIP LOCKED claiming, exponential backoff 1m/5m/30m/2h/12h, max 6 attempts, safe error text only), test mode with number allow-list (default ON), per-event template config (Admin → WhatsApp), marketing consent check (`hasMarketingConsent`; transactional and marketing are separate purposes), staff-created WhatsApp orders.
- Not built (needs the provider's official docs): the provider adapter (`server/messaging/provider.ts` is the port; `instance.ts` returns null), inbound webhook signature verification and de-duplication, delivery-status updates, session (24h window) messages, media/catalogue features.
- Until an adapter exists messages stay PENDING/SKIPPED and Admin → WhatsApp says so. `POST /api/cron/process-outbox` (Bearer `CRON_SECRET`) is what a scheduler should call.
- Crash window: the outbox row is written just after the order transaction commits, not inside it. A crash in between loses that one notification (the order itself is safe). Closing it needs the enqueue moved inside each transaction.

## AI try-on: kiosk and core built, AI service NOT connected
- Built: kiosk device registry (revocable credential, hash only), device-bound short-lived sessions, recorded consent (notice version + text, EN/HI), private photo storage (EXIF-stripped JPEG, never publicly served), job state machine, per-session and per-day caps, idempotent submit with no blind retry, safe error messages, QR continuation (opaque 15-minute token that opens one product page; no photo or personal data), retention (end/expiry/sweeper deletes photos and results), admin view. `POST /api/cron/sweep-tryon` (Bearer `CRON_SECRET`) is the backstop for refreshes, dropped networks and crashes.
- Not built (needs the real API contract): the adapter (`server/tryon/provider.ts` is our own port and may need to change), endpoint/auth/schema, sync vs async handling, input/garment image requirements, signed-URL handoff, provider retention documentation, real cost tracking. Online (website) try-on shows "not available".
- Consent wording must be written by the business and reviewed by legal counsel (Admin → Content → try-on notices). Capture is refused until the English notice exists.
- Camera/kiosk hardware (browser, OS, lockdown mode) is not decided; capture uses the browser camera API and was tested only with Chromium's synthetic camera.
