# Project Tanvi — Full-Stack Implementation Specification

> Primary implementation brief for the coding agent. Read this whole file before starting any phase.
> Unresolved business and integration inputs are tracked in `docs/OPEN_QUESTIONS.md`. Never fill those gaps with invented values.

---

## 0. Architecture overview

```
                          TANVI PLATFORM
         One brand · One catalogue · One source of truth

  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │  Storefront  │   │ Admin Studio │   │  AI Mirror   │
  │ shop, cart,  │   │  products,   │   │ capture,     │
  │ checkout,    │   │  orders,     │   │ try-on, QR   │
  │ wishlist     │   │  stock       │   │ (kiosk)      │
  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
         └──────────────────┼──────────────────┘
                            ▼
            Application API and business logic
   Auth · Catalogue · Inventory · Orders · Payments · Consent
                            │
     ┌──────────────┬───────┴────────┬──────────────────┐
     ▼              ▼                ▼                  ▼
 PostgreSQL    Object storage   WhatsApp adapter   AI try-on adapter
 products,     product photos,  existing provider, existing inference
 variants,     temporary        webhooks,          API, result
 stock,        try-on images    templates          handling
 customers,
 orders
```

This is a logical view, not a requirement to deploy each box as a separate service. Start with a **modular monolith** and split out services only when workload or deployment needs justify it.

---

## 1. Mission

Build **Tanvi**, a premium Indian ethnic-fashion e-commerce platform specialising in kurtis. It comprises:

1. A customer-facing online store.
2. A secure admin dashboard.
3. An in-store AI digital try-on kiosk (the "AI Mirror").
4. Website checkout and WhatsApp-assisted ordering.
5. Integrations with our **existing** WhatsApp Business API provider and our **existing** AI try-on API.

The application must be production-oriented, maintainable, secure, mobile-responsive, and easy for non-technical store staff to operate.

Do not build a static prototype. Implement the database, application logic, authentication, product management, inventory, ordering, integration adapters, and testable end-to-end workflows.

All three interfaces share one backend and a single source of truth for products, variants, pricing, inventory, and orders.

---

## 2. Rules for the coding agent

Before writing code:

- Inspect the repository, package manager, framework, environment files, database setup, and any existing implementation.
- Preserve useful existing code and conventions.
- Do not overwrite working integrations without understanding them.
- Produce a short implementation plan and an architecture decision record (ADR).
- Identify missing credentials, API documentation, and deployment assumptions, and add them to `docs/OPEN_QUESTIONS.md`.
- Separate confirmed requirements from assumptions.

Hard rules:

- **Never invent** AI or WhatsApp API endpoints, payload schemas, authentication methods, or webhook signatures. Use official provider documentation and supplied API contracts only.
- Keep secrets out of source code, browser bundles, logs, and committed files.
- Do not hardcode fake product data into production business logic. Use explicitly labelled fixtures only for development and automated tests.
- Implement real persistence and validation, never simulated success messages.
- Do not leave primary buttons or critical workflows non-functional.
- Never claim an integration is live until a real, configured integration has passed a test.
- Work in small, testable steps and verify each phase before proceeding.

If the repository is empty, initialise it with the stack in §5. If a different, sound stack already exists, document the differences and avoid unnecessary rewrites.

---

## 3. Brand and design system

**Brand:** TANVI
**Positioning:** Contemporary Indian ethnic fashion with understated luxury.
**Aesthetic:** Warm, elegant, feminine, premium, editorial, minimal.

### Colour tokens

| Token      | Hex       |
|------------|-----------|
| Ivory      | `#FAF7F2` |
| Beige      | `#E8DCCB` |
| Sand       | `#D4BEA5` |
| Taupe      | `#B5A18B` |
| Cocoa      | `#785744` |
| Espresso   | `#38271F` |
| Champagne  | `#C5A477` |
| White      | `#FFFFFF` |

### Typography

- Editorial headlines: Cormorant Garamond or Playfair Display.
- Interface and body text: DM Sans or Inter.

### Principles

- Generous whitespace, large fashion photography, refined grids, understated dividers, subtle hover transitions, readable type, restrained accents.
- **Avoid:** excessive gradients, neon colours, generic marketplace styling, overly rounded cards, distracting animation.
- Create a shared design-token layer for colour, typography, spacing, borders, shadows, and component states.
- Storefront: premium boutique. Admin: operationally clear while keeping the Tanvi identity. Kiosk: immersive, touch-friendly, no normal site navigation.
- All text, imagery, prices, and campaign content are editable where relevant.
- Meet WCAG 2.1 AA for colour contrast. Check the light tokens such as Sand and Taupe before using them for text.

---

## 4. Applications and routes

One repository, three logical applications.

### Customer storefront

```
/
/shop
/collections/[slug]
/products/[slug]
/search
/wishlist
/cart
/checkout
/order-confirmation/[orderReference]
/account
/account/orders
/try-on
/our-story
/contact
/policies/[slug]
```

Order-confirmation pages must not expose order information to unauthorised visitors. Use an authenticated session, or for guests a signed, expiring access token that is scoped to that one order and delivered to the customer by email or WhatsApp. The order reference alone must never grant access.

### Admin

```
/admin/login
/admin
/admin/products
/admin/products/new
/admin/products/[id]
/admin/categories
/admin/inventory
/admin/orders
/admin/orders/[id]
/admin/customers
/admin/content
/admin/campaigns
/admin/whatsapp
/admin/try-on-sessions
/admin/reports
/admin/settings
/admin/users
```

Enforce authorisation on the server, not only in navigation or client components.

### Kiosk

```
/kiosk
/kiosk/capture
/kiosk/collections
/kiosk/products
/kiosk/processing
/kiosk/result
/kiosk/continue
```

Use a dedicated layout with no site header or footer. Every kiosk session is isolated from all previous sessions. Never reuse a previous customer's captured image or generated result.

---

## 5. Recommended stack

- Next.js (App Router), React, TypeScript in strict mode.
- Tailwind CSS with accessible, reusable UI components.
- PostgreSQL with Prisma ORM (or an equivalent typed ORM).
- Zod (or equivalent) for runtime validation.
- Secure server-side sessions or a vetted auth provider.
- S3-compatible object storage for images.
- Payment-provider adapter, initially Razorpay.
- Server-side WhatsApp provider adapter.
- Server-side AI try-on provider adapter.
- Vitest or Jest for unit and integration tests, Playwright for end-to-end tests.
- A background worker or managed queue for asynchronous operations where required.

Pin compatible dependency versions and commit the lockfile. Prefer a modular monolith with clearly separated domain modules. Do **not** introduce microservices, Kubernetes, or a complex event bus without a demonstrated requirement.

---

## 6. Core domain model

Design a normalised relational schema with migrations, constraints, indexes, and foreign keys.

Entities:

- **Identity and access:** `User`, `Role`, `Permission`, `Customer`, `Address`, `CustomerConsent`
- **Catalogue:** `Category`, `Product`, `ProductImage`, `ProductVariant`
- **Inventory:** `InventoryBalance`, `InventoryMovement`, `StockLocation` (see the note below)
- **Shopping:** `Cart`, `CartItem`, `Wishlist`, `WishlistItem`, `Coupon`
- **Orders and payments:** `Order`, `OrderItem`, `PaymentAttempt`, `PaymentEvent`, `Shipment`, `ReturnRequest`, `Refund`
- **Marketing and content:** `Campaign`, `WebsiteContent`
- **Messaging:** `CommunicationLog`, `WhatsAppConversation` (where the provider supports it), `WhatsAppMessage`, `OutboxMessage`
- **Try-on:** `TryOnSession`, `TryOnJob`, `TryOnResult`, `KioskDevice`
- **Platform:** `WebhookEvent`, `AuditLog`, `IdempotencyRecord` (where required)

Rules:

- Model products separately from variants. A product has multiple sizes and colours. Each sellable variant has a unique SKU, a price policy, and an inventory balance.
- **Money:** integer paise, or a rigorously defined decimal type. Never use floating-point arithmetic. INR is the default currency, with Indian formatting for customer-facing prices (₹1,23,456).
- **Prices and tax:** whether stored prices include GST is a configured business setting (see OPEN_QUESTIONS). Store the GST rate applied to each order line as a snapshot.
- `OrderItem` snapshots the name, SKU, size, colour, quantity, unit price, and tax at order time. Later product edits must not change historical orders.
- **Stock location:** model inventory per `(variant, location)` from the start, even if there is only one location at launch. A second store or warehouse should then need configuration, not a migration.
- Use migrations for every schema change. Never use runtime auto-sync in production.

---

## 7. Product categories

Six initial categories, all part of Tanvi's kurti-focused range. They differ by garment type, design, use case, and price positioning:

1. Regular Wear
2. Festive Wear
3. Premium Wear
4. Three-Piece Kurtis
5. Short Tops
6. Co-ord Sets

- Categories are stored in the database with an editable name, slug, description, image, display order, and publication status.
- Create them with an **idempotent seed script** that is safe to run repeatedly.
- Never hardcode category labels across the app. Always read them from the database.

---

## 8. Product management

Administrators can:

- Create, edit, duplicate, publish, unpublish, and archive products.
- Upload multiple images, and preview, reorder, replace, and delete them. Set a primary image and descriptive alt text.
- Assign one primary category plus optional merchandising collections.
- Configure the name, slug, description, SKU or parent code, price, and optional original (compare-at) price.
- Configure sizes, colours, variant SKUs, and stock.
- Record fabric, fit, neckline, sleeve length, garment length, pattern, care instructions, size-chart data, and HSN code (needed for GST invoicing).
- Set featured, new-arrival, and homepage visibility flags.
- Enable or disable AI try-on eligibility, and upload or approve the garment image used by the try-on API.
- Configure SEO metadata.
- Search and filter the product table.
- Import and export products in supported CSV formats.
- Perform validated bulk operations.

Uploads:

- Use a secure direct-to-storage upload flow (presigned URLs) or a protected upload endpoint.
- Validate file size, MIME type, extension, and actual content where feasible.
- Generate optimised thumbnails and responsive renditions. Never store image binaries in PostgreSQL.
- Uploading an image must not publish the product unless publishing is explicitly selected.
- Publishing requires valid essential fields and at least one appropriate image.

---

## 9. Inventory and concurrency

One authoritative inventory serves both online and physical-store workflows.

Track for each variant and location:

- On-hand quantity
- Reserved quantity
- Available quantity (on-hand minus reserved, calculated consistently everywhere)
- Low-stock threshold
- Movement history
- Reason for each manual adjustment

Rules:

- Handle reservations and sales transactionally. Prevent overselling with transactions, row locking, or atomic conditional updates (`UPDATE … WHERE available >= qty`).
- Validate stock when items are added to the cart **and again** at order placement.
- Release reservations according to configured cancellation and expiry rules, for example an unpaid online order reservation expiring after N minutes.
- Repeated payment webhooks must never decrement inventory twice.
- Provide an admin workflow for recording physical-store sales and stock adjustments. With no POS integration, this is an explicit **manual** workflow, not a fictional automatic sync.
- Returned stock goes back to *sellable* or *damaged/quarantine* according to the inspection outcome. It is never restocked automatically.

---

## 10. Customer storefront

### Homepage

- Editable hero
- Six collection tiles
- New arrivals
- Featured products
- Curated editorial collections
- AI try-on promotion
- Brand story
- Approved social media gallery
- WhatsApp shopping CTA
- Newsletter signup with marketing consent
- Store details and footer

### Collection pages

Search, sorting, filters (size, colour, price, fabric), pagination, and useful empty states.

### Product pages

- Gallery with zoom
- Details and SKU
- Variant and size selection
- Stock availability, shown as in stock, low stock, or out of stock rather than exact quantities unless configured
- Size chart
- Care instructions
- Shipping and returns information
- Wishlist
- Related products
- WhatsApp enquiry
- "Try This Look" when the product is eligible

Never display unsupported attributes or fabricated ratings, reviews, discounts, or stock counts.

### SEO

Metadata, structured data (Product, Offer, BreadcrumbList), sitemap, canonical URLs, Open Graph tags, and optimised image delivery.

---

## 11. Cart and checkout

Supports guest and authenticated checkout.

The cart preserves variants and quantities, shows accurate totals, and validates stock.

Implement:

- Add, update, and remove items, with quantity validation and variant availability validation.
- Server-calculated subtotal.
- Validated coupon discounts.
- Shipping charges and GST, calculated per the configured rules in OPEN_QUESTIONS.
- Customer details.
- Indian address fields with 6-digit PIN code validation and a serviceability check where a courier integration exists.
- Payment selection.
- Order review.
- Confirmation and error states.

**The server recalculates prices, discounts, taxes, shipping, and the payable amount. Never trust client-submitted totals.**

### Online payments (via the payment adapter)

- Create payment orders on the server.
- Verify provider signatures.
- Process payment webhooks and deduplicate events.
- Handle failed, cancelled, and pending payments.
- Prevent duplicate orders and duplicate inventory deductions.
- Reconcile payment status with provider records where needed.

### Other rules

- COD is configurable and **disabled unless explicitly enabled**.
- Refunds, cancellations, returns, and exchanges follow the configured policy (see OPEN_QUESTIONS) and produce an audit trail.
- Generate a GST-compliant tax invoice for each paid order, including GSTIN, HSN codes, and the tax breakup, once the business details are configured.

---

## 12. WhatsApp ordering and communications

Integrate our **existing** WhatsApp Business API provider.

Before implementing, inspect the supplied integration code, the provider documentation, the credentials configuration, and the available templates. Confirm the actual provider and the features it supports.

### Provider interface

The interface provides operations equivalent to:

- Send an approved template message.
- Send an allowed session message (inside the 24-hour customer service window).
- Receive and validate webhook events.
- Retrieve message status where supported.
- Normalise provider-specific errors.
- Record delivery outcomes.

Do not assume the provider supports conversation retrieval, arbitrary sending, templates, media, or catalogue features until each is verified.

### WhatsApp shopping flow

1. The customer opens a WhatsApp conversation with Tanvi's configured business number.
2. Product or cart context is included as a concise prefilled message or a secure link, where supported.
3. The customer asks about sizes, colours, availability, and delivery.
4. Store staff confirm availability and agree the order.
5. The order record is created through an **authenticated staff workflow** or a verified customer-order workflow.
6. Stock is reserved according to the configured ordering policy.
7. The order source is recorded as `WHATSAPP`.
8. Updates are sent through approved templates or permitted session messages.

Opening WhatsApp proves nothing. **Never create a confirmed order because a user clicked a WhatsApp link.**

When staff create an order manually, record the staff user, order source, customer details, variants, agreed price, payment terms, and confirmation status. For prepaid WhatsApp orders, prefer sending a Razorpay payment link generated by the server.

### Transactional notifications

Configurable notifications for:

- Order received
- Order confirmed
- Payment confirmed
- Dispatched
- Delivered
- Cancelled
- Return or refund updates

Rules:

- Send a notification only **after** the business event is committed.
- Use an **outbox pattern** so transient provider failures don't lose messages.
- Store the provider message ID, normalised status, timestamps, attempt count, and safe error details.
- Verify webhooks, deduplicate events, retry with backoff, and respect rate limits.
- Marketing requires recorded opt-in consent and compliance with Meta policies. Keep transactional and marketing purposes strictly separate.
- Keep credentials server-side and provide a safe test mode that sends only to allow-listed numbers.

---

## 13. Social media

- Configurable links for Instagram, Facebook, and any other approved channels.
- An admin-managed social gallery and campaign content.
- Use authorised embeds or official APIs only. No scraping, and no tokens in the frontend.
- Campaign UTM parameters and consent-aware analytics.
- Catalogue sync and social commerce are enabled only when the provider and account permissions support them.

---

## 14. AI try-on API integration

We already have a clothing-replacement model behind an API. **Integrate it. Do not build a replacement or invent its contract.**

Obtain and inspect the following before implementing:

- Base URL and endpoint
- Authentication mechanism
- Request schema
- Input image format and constraints
- Garment-image requirements
- Response schema
- Whether calls are synchronous or asynchronous
- Job status and result retrieval mechanism
- Maximum file size
- Timeouts and rate limits
- Error codes
- The provider's data retention policy

Create an **AI provider adapter** that isolates vendor specifics.

### Normalised workflow

1. Validate the try-on session and the selected product.
2. Verify product eligibility.
3. Validate the customer's explicit capture or upload consent.
4. Validate the input image and store it temporarily.
5. Create a `TryOnJob` with a unique internal ID.
6. Submit the input image and the approved garment-image reference according to the real API contract.
7. Handle a synchronous response, or poll or receive a callback for asynchronous results, as documented.
8. Store a normalised status and safe error details.
9. Display the generated result.
10. Delete temporary source and result assets according to the retention policy.

Rules:

- Use idempotency keys, request limits, concurrency controls, timeouts, and bounded retries. **Do not blindly retry non-idempotent inference requests.**
- Give the API signed, short-lived URLs for private images. Never expose permanent storage URLs or API credentials.
- The website and the kiosk call the **same** application-level AI service.
- Use an explicit state machine, for example `CREATED → VALIDATING → QUEUED → PROCESSING → SUCCEEDED`, with `FAILED`, `CANCELLED`, and `EXPIRED` transitions. Use only states the real provider supports.
- Never fabricate progress, outputs, fit accuracy, or success.
- Track per-job cost and enforce configurable daily and per-session caps.

---

## 15. Online and kiosk try-on

### Online flow

The customer uploads an image or uses an authorised camera flow. After consent:

1. Select an eligible product.
2. Validate the image requirements.
3. Submit the job securely.
4. Show processing, retry, and failure states.
5. Display the real result.
6. Return to the product page, or add to cart and keep browsing.

Online try-on sits behind a **feature flag** until privacy, cost, rate limits, and model capacity are validated.

### Kiosk flow

A full-screen experience for a large touchscreen:

1. Welcome
2. Consent
3. Camera preview and positioning guidance
4. Explicit capture
5. Retake or confirm
6. Browse the six categories
7. Select a product
8. AI processing
9. Before/after result
10. Try another garment
11. QR handoff or finish
12. Session cleanup

Requirements:

- Uses the shared catalogue and inventory.
- Configurable inactivity timeout, automatic session reset, recovery from camera and network failures, and a safe return-to-home action.
- A short-lived kiosk session token, with uploaded assets and jobs bound to that session.
- Each kiosk device is registered (`KioskDevice`) and authenticates with a revocable device credential. It never uses an admin or customer session.
- Target device, OS, and browser are listed in OPEN_QUESTIONS. Kiosk-mode lockdown and camera-permission handling depend on them.

### QR handoff

- The QR code points to a short-lived, securely scoped continuation URL.
- The customer opens the product on their own phone and checks out normally.
- Never put images, personal data, secrets, or unrestricted internal IDs in QR URLs.
- Share a generated try-on image with the phone only after explicit consent, and only through secure, expiring access.

### Privacy (India DPDP Act, 2023)

Images of customers' faces and bodies are personal data. Design for compliance with the Digital Personal Data Protection Act. The final consent text must be reviewed by the business or legal counsel, not written by the agent as final.

- Show a clear, specific, plain-language consent notice before capture. It states the purpose, retention period, any third party (the AI provider), and how to withdraw. Provide it in English and Hindi at minimum.
- Record the consent itself: timestamp, notice version, session, and purpose.
- No facial recognition or identity matching.
- No use of photos for model training without separate, informed, opt-in consent.
- Delete temporary assets on completion, timeout, or cancellation, using configurable retention limits.
- Cleanup must also run after a browser refresh, a network interruption, and kiosk recovery. Use a scheduled sweeper job as a backstop.
- Document copies retained by the AI provider. Local deletion does not guarantee third-party deletion.

---

## 16. Admin dashboard

Role-based access with these suggested roles:

- Super Admin
- Store Manager
- Product Manager
- Order Manager
- Marketing Manager
- Support Agent

Enforce least privilege on every protected API and admin action.

Provide:

- Sales and order overview
- Products
- Categories
- Inventory movements
- Orders and fulfilment
- Customer history
- Campaigns and coupons
- Website content
- WhatsApp delivery logs
- Try-on job status and cost
- Basic reports
- User management
- Integration health
- Audit logs
- Business settings, including GSTIN, tax mode, shipping rules, return policy, and COD toggle

Reports use real records and explicitly defined metrics. Provide date filters and exports, and restrict exports of personal data by role. Never show mock sales figures in production.

---

## 17. Security

- Server-side authorisation
- Secure password and session handling
- Admin MFA where supported
- Request validation
- Rate limiting
- CSRF protection where applicable
- Protection against SQL injection and XSS
- Secure upload validation
- Secret management
- Webhook signature verification
- Idempotent payment and messaging events
- Audit logging
- Data minimisation
- Safe error messages
- Security headers (CSP, HSTS, and so on)
- Production-safe logging
- Dependency scanning and security review

Never log access tokens, full auth headers, raw payment credentials, or unnecessary personal images. Never expose provider error payloads or infrastructure details to customers.

---

## 18. Testing

Unit, integration, and end-to-end tests for:

- Product CRUD and publication
- Image upload validation
- Category filtering
- Variant selection
- Inventory reservations and **concurrent orders**
- Cart calculations, including GST and shipping
- Checkout validation
- Payment verification and duplicate webhooks
- WhatsApp webhook deduplication
- Message retry and failure states
- Role-based authorisation
- AI provider request mapping
- AI job success and failure
- Kiosk session isolation
- Consent enforcement
- QR continuation
- Session expiry and image cleanup

Use mocked provider adapters in automated tests, and a clearly separated sandbox for real integration testing. Include regression tests for critical business rules.

---

## 19. Engineering practices

- Strict TypeScript.
- Shared domain types and validation schemas.
- Explicit module boundaries.
- Centralised error handling.
- Structured logs with correlation IDs.
- Database migrations and idempotent seed scripts.
- Consistent API response conventions.
- Pagination on large lists.
- Transactions for financial and inventory workflows.
- Background processing for unreliable external operations.
- Environment-specific configuration.
- Automated lint, type-check, and test commands.
- A CI pipeline for pull requests and deployment.

**Avoid:** giant components, duplicated business logic, direct database calls from UI components, `any`, and hidden side effects.

---

## 20. Required documentation

| File | Contents |
|------|----------|
| `README.md` | Setup, scripts, and an overview |
| `docs/ARCHITECTURE.md` | Modules, data flow, ADRs |
| `docs/DESIGN_SYSTEM.md` | Tokens, components, and their usage |
| `docs/DATABASE.md` | Schema, migrations, seeds |
| `docs/API.md` | Endpoints and conventions |
| `docs/INTEGRATIONS.md` | WhatsApp, payments, AI, storage, and webhook setup |
| `docs/SECURITY.md` | Threat model and controls |
| `docs/TESTING.md` | Test strategy and commands |
| `docs/DEPLOYMENT.md` | Environments, deployment steps, backups |
| `docs/OPERATIONS.md` | Runbooks and troubleshooting |
| `docs/OPEN_QUESTIONS.md` | Unresolved inputs, kept up to date |
| `.env.example` | Every variable with its purpose and whether it is required. No real secrets |

---

## 21. Implementation sequence

| Phase | Scope |
|-------|-------|
| 1 | Repository inspection, architecture, design system, database, authentication |
| 2 | Product catalogue, image upload, categories, variants, inventory |
| 3 | Storefront, collection pages, product pages, search, wishlist |
| 4 | Cart, checkout, payments, order management, inventory consistency |
| 5 | WhatsApp ordering, notifications, webhooks, social integration |
| 6 | AI provider adapter, online try-on, kiosk, QR handoff, cleanup |
| 7 | Reporting, operational controls, accessibility, security, performance, deployment |

Phases 5 and 6 are **blocked** until the provider documentation and credentials listed in OPEN_QUESTIONS are supplied. Do not stub them as if they were live.

At the end of each phase:

1. Run the type check.
2. Run lint.
3. Run the relevant tests.
4. Test the affected workflows manually.
5. Update the documentation and `OPEN_QUESTIONS.md`.
6. Record remaining limitations.
7. Commit a coherent change.

Do not proceed while critical regressions remain.

---

## 22. Definition of done

- An administrator creates a product with images, variants, price, and stock, publishes it, and it appears correctly in the storefront.
- A customer places an online order through the configured checkout, or starts a WhatsApp-assisted order that follows a clear confirmation workflow.
- Inventory and order states remain consistent.
- The kiosk captures a photo only after consent, submits it through the real AI integration, shows the actual output, and cleans up temporary assets.
- All external integrations are documented, testable, and safely configurable.
- The deployed app contains no exposed secrets, no uncontrolled admin access, no fabricated integration success, and no non-functional primary workflows.

**Start** by inspecting the repository and producing the architecture, data model, and implementation plan. Then build the first vertical slice:

> admin creates product → uploads images → publishes → customer sees it in the correct category.

Do not generate the whole application in one unverified code dump. Build, test, and refine incrementally.

---

## 23. Suggested repository structure

A guide, not a mandate. Create folders only as they are needed.

```
tanvi/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── (storefront)/
│       │   ├── admin/
│       │   ├── kiosk/
│       │   ├── api/
│       │   └── layout.tsx
│       ├── components/
│       ├── features/
│       │   ├── products/
│       │   ├── inventory/
│       │   ├── cart/
│       │   ├── checkout/
│       │   ├── orders/
│       │   ├── whatsapp/
│       │   └── try-on/
│       └── styles/
├── packages/
│   ├── database/        (schema.prisma, migrations/, seed.ts)
│   ├── domain/
│   ├── validation/
│   ├── integrations/    (whatsapp/, payments/, ai-try-on/, storage/)
│   ├── ui/
│   └── config/
├── tests/               (integration/, e2e/)
├── docs/
├── .env.example
├── README.md
└── package.json
```

---

## 24. Critical workflows to validate

Prioritise these over adding features.

**A — Product to purchase**

1. Admin creates a Premium Wear kurti with three sizes and five photographs.
2. Admin publishes it and sets stock for each variant.
3. The storefront shows it in Premium Wear at the correct price.
4. A customer selects a size and adds it to the cart.
5. Checkout revalidates stock and payment, then records the order.
6. Admin sees the order with the correct status.

**B — WhatsApp-assisted order**

1. The customer clicks "Order on WhatsApp" from a product or the cart.
2. WhatsApp opens with the product or cart context.
3. The customer and staff confirm the variant, availability, price, and delivery.
4. The system records a WhatsApp-sourced order through the verified workflow.
5. Stock is reserved per policy, and updates go out via the configured provider.

**C — AI Mirror**

1. The customer starts a kiosk session and accepts the capture notice.
2. The camera captures an image, and the customer selects a real Tanvi product.
3. The backend validates the request and calls the existing AI API.
4. The actual generated image appears.
5. The customer tries another garment or scans the QR code to continue shopping.
6. The session ends and temporary images are cleaned up according to policy.
