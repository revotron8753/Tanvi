# Open questions

Inputs the business or integration owners still need to supply. The coding agent must not guess these. Mark each item **Resolved** with the answer and date, and move it to the bottom section.

Legend: 🔴 blocks a phase · 🟡 needed before launch · 🟢 can default for now

---

## Phase 1 decisions taken on defaults (2026-10-29)

You asked me to proceed without answering these, so I used the stated defaults. Tell me to change any; most are cheap to reverse.

- [x] **Q1 Git location**: `git init -b main` inside `Tanvi/`. *Still open:* is there a GitHub remote? CI workflow exists but has never run.
- [x] **Q2 Local PostgreSQL**: project-local embedded Postgres (`npm run db:dev`, data in `.pgdata/`). Dev only. *Open:* which managed/production database will you use?
- [x] **Q3 Package manager**: npm workspaces.
- [x] **Q4 Admin MFA**: TOTP required for Super Admin, optional for others.
- [ ] **Q5 Role/permission matrix**: seeded matrix is a **proposal** in `packages/domain/src/permissions.ts`. Needs owner approval before real staff use it.
- [ ] **Q6 First Super Admin email/name**: created via `create-super-admin` script from env. Not yet run for a real person.
- [ ] **Q7 🟡 Customer authentication** (Phase 3/4): email OTP, phone OTP via WhatsApp/SMS, or password? Depends on email provider and WhatsApp answers.
- [x] **Q8 Money column size**: `Int` paise (max about ₹2.1 crore per value). Tell me if a single order could exceed that.
- [ ] **Q9 🟡 Password reset / staff invites**: needs an email provider. Until then a Super Admin sets temporary passwords.
- [ ] **Q10 🟢 Fonts**: Cormorant Garamond + DM Sans in use (working default). Confirm or switch.
- [ ] **Q11 🟡 Deployment proxy**: client IP for rate limiting is read from `X-Forwarded-For`. Confirm the hosting target puts a trusted proxy in front.

---

## Integrations

### 🔴 AI try-on API (blocks Phase 6)
- [ ] Base URL, endpoint(s) and auth method
- [ ] Request and response schema (sample request and response JSON)
- [ ] Sync or async? Job status, polling or callback mechanism
- [ ] Input image constraints: format, resolution, max size, framing/pose requirements
- [ ] Garment image requirements: flat lay, model shot, background, resolution
- [ ] Timeouts, rate limits, concurrency limits
- [ ] Error codes
- [ ] Cost per call
- [ ] Provider's data retention: how long it keeps inputs and outputs, and whether it trains on them
- [ ] Sandbox or test environment available?

### 🔴 WhatsApp Business API (blocks Phase 5)
- [ ] Which provider? (Meta Cloud API direct, or a BSP such as Interakt, Gupshup, AiSensy, WATI…)
- [ ] API docs, credentials, webhook signature method
- [ ] Business phone number
- [ ] Approved templates: names, languages, variables (order received, confirmed, paid, dispatched, delivered, cancelled, refund)
- [ ] Is there existing integration code to inspect?
- [ ] Is a test number or allow-list available?

### 🟡 Payments
- [ ] Razorpay confirmed? Test and live keys, webhook secret
- [ ] Payment methods to enable (UPI, cards, netbanking, wallets)
- [ ] COD: enabled at launch? Any order-value limits or extra charges?
- [ ] Payment links for WhatsApp orders: yes or no?

### 🟡 Shipping and courier
- [ ] Courier or aggregator (Shiprocket, Delhivery, manual)?
- [ ] PIN code serviceability source
- [ ] Shipping rates: flat, weight-based, zone-based? Free-shipping threshold?

### 🟢 Infrastructure
- [ ] Hosting target (Vercel, AWS, GCP, VPS)
- [ ] Object storage provider (S3, R2, GCS). *Phase 2 ships a local-disk driver only (`STORAGE_LOCAL_DIR`); an S3-compatible driver is not written until this is answered. Local disk is not suitable for multi-instance or serverless hosting.*
- [ ] Email provider for order emails and guest access links
- [ ] Domain name

---

## Tax and invoicing (🟡)
- [ ] GSTIN and registered business name and address
- [ ] Are listed prices **GST-inclusive** or exclusive?
- [ ] GST rates by price band for the HSN codes Tanvi sells. Verify the current apparel rates with an accountant; they changed in 2025.
- [ ] HSN codes per category or product
- [ ] Invoice numbering format
- [ ] Interstate vs intrastate (IGST vs CGST + SGST) handling: confirm the state of registration

---

## Returns, exchanges and cancellations (🟡)
- [ ] Return window (days from delivery)
- [ ] Exchanges allowed? Size-only, or any product?
- [ ] Non-returnable items (sale, custom-stitched…)
- [ ] Refund method and timeline (original payment method, store credit)
- [ ] Who pays return shipping?
- [ ] Cancellation allowed until which order status?
- [ ] Inspection outcome: restock as sellable or quarantine as damaged

---

## Inventory and stores (🟡)
- [ ] How many physical stores now? Any planned?
- [ ] Separate warehouse, or ship from the store?
- [ ] Any existing POS system? If so, which one, and does it have an API?
- [ ] Reservation expiry for unpaid online orders (suggested default: 15 min)
- [ ] Stock reservation policy for WhatsApp orders (on staff confirmation, or on payment?)
- [ ] Should the storefront show exact stock counts or only in stock / low / out of stock?

---

## Kiosk (🔴 for Phase 6)
- [ ] Hardware: screen size, orientation (portrait?), touch device
- [ ] OS and browser (e.g. Windows + Chrome kiosk mode, Android, ChromeOS)
- [ ] Camera model and mounting height/position
- [ ] Network: store Wi-Fi reliability, fallback?
- [ ] Inactivity timeout (suggested default: 90 s)
- [ ] Number of kiosks and their locations

---

## Privacy and legal (🟡)
- [ ] Final consent notice text (English + Hindi), reviewed by legal or the business owner
- [ ] Retention period for try-on images (suggested default: delete at session end; sweeper after 1 h)
- [ ] Is sharing the try-on image to the customer's phone allowed?
- [ ] Privacy policy, terms, shipping and returns policy pages: who writes them?
- [ ] Grievance officer / contact for data requests (DPDP Act)

---

## Business and content (🟢)
- [ ] Final fonts: Cormorant Garamond vs Playfair Display; DM Sans vs Inter
- [ ] Logo files and brand photography
- [ ] Initial product data (CSV?) and photos
- [ ] Size chart(s) per category
- [ ] Store address, hours, contact details
- [ ] Social handles (Instagram, Facebook, others)
- [ ] Admin users and their roles at launch
- [ ] Analytics tool (GA4, others) and cookie consent approach

---

## Resolved
_(move items here with the answer and date)_

---

## Added during Phases 3–4 (2026-10-29)
- [ ] 🟡 **Razorpay**: test keys + webhook secret to verify the adapter for real; confirm the CSP origins Checkout needs (see INTEGRATIONS.md).
- [ ] 🟡 **GST on shipping/COD fee**: code treats them as non-taxable. Accountant to confirm.
- [ ] 🟡 **IGST vs CGST+SGST**: invoice uses the buyer's *state name* → GST state code. Confirm business state code.
- [ ] 🟡 **Policies/story/contact text**: pages do not exist publicly until written in Admin → Content.
- [ ] 🟡 **Newsletter consent wording** (`features/shop/consent.ts`) and sending provider (nothing is sent today).
- [ ] 🟢 **Social media gallery** (SPEC §10/§13): not built; needs the approved embed/API approach.
- [ ] 🟢 **Customer accounts/order history** (`/account`): not built; blocked on Q7 (login method).
- [ ] 🟢 **Low-stock thresholds / exact counts**: storefront shows in/low/out only (`showExactStock` setting exists but is unused).
- [ ] 🟡 **Order notifications** (email/WhatsApp): none sent yet; the confirmation link is shown on screen only. Needs email provider or WhatsApp (Phase 5).

## Added with Phases 5–6 foundations (2026-10-31)
- [ ] 🔴 WhatsApp provider adapter: provider name, API docs, credentials, webhook signature method, approved template names/languages/variables (enter them in Admin → WhatsApp).
- [ ] 🔴 AI try-on adapter: the items already listed above, plus: is the API sync or async, and does it accept a garment image reference or upload.
- [ ] 🟡 Try-on consent notice text, English and Hindi (Admin → Content). Capture stays disabled without it.
- [ ] 🟡 Daily/per-visit try-on caps and kiosk idle timeout (defaults: 200/day, 5/visit, 90 s) once cost per call is known.
- [ ] 🟡 Kiosk hardware: browser/OS/kiosk-mode lockdown, camera position, portrait vs landscape; verify the capture screen on the real device.
- [ ] 🟢 Whether to move notification enqueue inside each order transaction (see INTEGRATIONS.md crash window).

## Added with the editorial redesign (2026-11-02)
- [ ] 🟡 **Reviews**: shown as "customer reviews", not "verified purchase" (guest reviews are not matched to orders). Decide whether to restrict reviews to people who bought (needs customer accounts, Q7). Moderation is in Admin → Reviews.
- [ ] 🟡 **Review spam**: protected by a hidden field, one review per email per product, a moderation backlog cap (200) and staff approval. No per-IP limit yet.
- [ ] 🟢 **Journal and About content**: nothing is shown until written (Admin → Journal; Admin → Content → Homepage brand story, which now accepts an image). Who writes it?
- [ ] 🟢 **Permissions**: reviews and journal use `content.write`, which only Super Admin and Marketing Manager have in the proposed matrix (see Q5).
