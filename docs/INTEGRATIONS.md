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
