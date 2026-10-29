# Open questions

Inputs the business or integration owners still need to supply. The coding agent must not guess these. Mark each item **Resolved** with the answer and date, and move it to the bottom section.

Legend: 🔴 blocks a phase · 🟡 needed before launch · 🟢 can default for now

---

## Phase 1 review questions (added 2026-10-29)

Defaults in *italics* are what I will do if you don't say otherwise.

- [ ] **Q1 🔴 Git location.** `/Users/fyxospaces/Tanvi` sits inside a git repo rooted at your home directory (no commits yet, branch `master`; SPEC refers to `main`). *Default: run `git init` inside `Tanvi/` with branch `main` so it is its own repo.* Is there a GitHub remote for CI?
- [ ] **Q2 🔴 Local PostgreSQL.** None installed, and no Docker. Options: install Docker Desktop, `brew install postgresql`, or a hosted dev DB (Neon/Supabase). *No default — DB-backed work and tests are blocked until you choose.*
- [ ] **Q3 🟢 Package manager.** *Default: npm workspaces (already installed). Switch to pnpm if you prefer.*
- [ ] **Q4 🟡 Admin MFA policy.** *Default: TOTP required for Super Admin, optional for other roles.*
- [ ] **Q5 🟡 Role/permission matrix.** I will propose a matrix for the six roles in SPEC §16 for your review. Who approves it?
- [ ] **Q6 🟢 Super Admin bootstrap.** *Default: one-off CLI reads email and initial password from env at first run; forced password change on first login.* Which email should be the first Super Admin?
- [ ] **Q7 🟡 Customer authentication method** (needed by Phase 3/4): email OTP, phone OTP via WhatsApp/SMS, or password? Depends on the email provider and WhatsApp answers below.
- [ ] **Q8 🟢 Currency range.** Largest plausible single order total (decides `Int` vs `BigInt` paise columns). *Default: `Int` if under ₹2 crore.*

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
- [ ] Object storage provider (S3, R2, GCS)
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
