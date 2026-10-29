# Security (Phase 1: staff authentication surface)

## Controls implemented
- Passwords: Argon2id; min 12 chars; timing equalised for unknown emails; generic login errors.
- Lockout: 5 failures → 15 min lock. IP rate limit: 30 attempts / 15 min (HMAC-hashed IP). MFA attempts: 6 / 10 min.
- Sessions: 256-bit random token, only its SHA-256 stored; HttpOnly, SameSite=Lax, Secure (+ `__Host-` prefix) in production; 30 min idle / 12 h absolute; revoked on logout, deactivation and password change.
- MFA: TOTP (RFC 6238, tested against the RFC vectors), secret AES-256-GCM encrypted at rest, replay rejected, 8 single-use hashed recovery codes. Required for Super Admin (enforced by the guard).
- Authorisation: permission-based, server-side, in `requireAdmin` / `requirePermissionForAction`. A structural test fails if any admin page, route handler or server action lacks a guard. Denied → real HTTP 403.
- CSRF: Next.js server actions verify Origin against Host; cookies are SameSite=Lax. Route handlers added later must check Origin themselves.
- Headers: CSP, HSTS, nosniff, frame deny, referrer policy, permissions policy (tested in e2e).
- Audit log for auth events and user changes; no passwords/tokens/secrets stored (tested).
- Env validated at boot with Zod; errors name variables, never values. `.env` is gitignored.

## Known limitations (tracked)
- CSP allows `'unsafe-inline'` scripts (Next bootstrap). Move to nonce-based CSP in Phase 7.
- Client IP comes from `X-Forwarded-For`; only correct behind a trusted proxy that overwrites it. Confirm at deployment.
- No dependency scanning beyond `npm audit` in CI; no formal threat model beyond this list yet (Phase 7).
- No password reset / email flow (needs email provider; OPEN_QUESTIONS).
- Rate limits are per-database; fine for one deployment, revisit if scaled out.
- Customer auth, kiosk device credentials, webhook verification: not built.

## Added in Phases 2–4
- Uploads: validated by decoding (not by name/MIME), size/dimension limited, re-encoded to WebP (EXIF/GPS dropped), stored under generated keys; the media route serves only fixed rendition names (no path traversal, tested).
- Orders: guest confirmation requires a 192-bit token (only its hash is stored); the reference alone is useless. Prices/totals are never read from the browser.
- Payments: signature verified with the provider order id from our database; webhook HMAC over raw body; amount must equal the order total; duplicate events ignored; stock committed once per item under a row lock.
- Machine endpoints (webhook, cron) authenticate by signature/secret; a structural test fails if a new route handler has no authentication.
- CSV export neutralises spreadsheet formulas; PII only for roles with `customers.export`.
- JSON-LD is serialised with `<` escaped.
- Public storefront actions are allow-listed and tested not to import admin code.

## Added limitations
No CAPTCHA/rate limit on public actions (newsletter, cart, checkout); no email verification of customer addresses; the Razorpay CSP origin list is unverified; no dependency scanning beyond `npm audit`; no structured request logging.
