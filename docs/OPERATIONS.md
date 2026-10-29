# Operations runbook

| Situation | What to do |
|---|---|
| Customer paid but order shows "awaiting payment" | Find the order (Admin → Orders, search reference). Check Razorpay dashboard for the payment. The webhook normally confirms within seconds; if it never arrived, check webhook delivery in the dashboard and re-send it. Do NOT mark paid by hand: re-delivery is idempotent. |
| Order shows "Refund due" | Refund in the Razorpay dashboard, then Admin → Order → "Record refund" with the refund id. (Causes: cancelled paid order, or payment arriving after the reservation expired.) |
| Stock looks wrong | Admin → Inventory → recent movements shows every change with actor/reason. Correct with "Set counted quantity" (needs a reason). Never edit the database directly; the ledger is append-only. |
| Unpaid orders holding stock | They expire automatically (default 15 min) via the cron call and at each checkout. Check `POST /api/cron/expire-orders` is scheduled. |
| Staff member left | Admin → Users → Disable (revokes all their sessions). Accounts with history are never deleted. |
| Locked-out staff | Wait 15 minutes, or a Super Admin resets by creating a new temporary password (no reset-by-email until an email provider exists). Lost MFA device: recovery codes; else a Super Admin must clear MFA in the database (documented gap). |
| Invoice not available | Admin → Settings shows exactly which business details are missing. |
| Suspected breach | Disable users, rotate `APP_ENCRYPTION_KEY` (re-enrol MFA), `APP_HASH_SECRET`, Razorpay keys and secrets; review Admin → Audit log. |

Logs: the app logs to stdout; secrets, tokens, passwords and provider payloads are never logged. Structured logging with correlation IDs is not implemented yet.
