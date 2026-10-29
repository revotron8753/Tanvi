import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { createPrisma } from "@tanvi/database";
import { seedCore } from "../../../packages/database/src/seed-core";
import { encrypt } from "../src/server/auth/crypto";
import { createStaffUser } from "../src/server/auth/service";
import { generateTotpSecret } from "../src/server/auth/totp";
import { adjustOnHand, setOnHand } from "../src/server/catalog/inventory";
import { addProductImage, addVariant, createProduct, publishProduct, type ProductFields } from "../src/server/catalog/products";
import { LocalDiskStorage } from "../src/server/storage";
import sharp from "sharp";

export const FIXTURE = { name: "E2E Storefront Kurti", slug: "e2e-storefront-kurti", pricePaise: 249900 };
export const CHECKOUT_FIXTURE = { name: "E2E Checkout Kurti", slug: "e2e-checkout-kurti", pricePaise: 150000 };
export const RZP = { keyId: "rzp_test_e2e", keySecret: "e2e_secret", webhookSecret: "e2e_whsec", port: 3199 };

export const E2E = {
  password: "e2e passphrase long enough",
  pmEmail: "e2e-pm@example.test",
  saEmail: "e2e-sa@example.test",
  smEmail: "e2e-sm@example.test",
};

/** Seeds the TEST database with real users via the real service code. Fixtures live only here. */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const fake = await startFakeRazorpay();
  const url = process.env.DATABASE_URL_TEST;
  const key = process.env.E2E_ENCRYPTION_KEY;
  if (!url || !key) throw new Error("Set DATABASE_URL_TEST and E2E_ENCRYPTION_KEY to run e2e (see docs/TESTING.md)");
  const prisma = createPrisma(url);
  const cfg = { idleMinutes: 30, absoluteHours: 12, encryptionKey: key, hashSecret: randomBytes(32).toString("hex") };
  try {
    await seedCore(prisma);
    await prisma.rateLimitBucket.deleteMany({});
    for (const [email, roleKey] of [[E2E.pmEmail, "product_manager"], [E2E.saEmail, "super_admin"], [E2E.smEmail, "store_manager"]] as const) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        // Users with stock-ledger history cannot be deleted (append-only), so reset them instead.
        await prisma.user.update({ where: { id: existing.id }, data: { isActive: true, failedLoginCount: 0, lockedUntil: null, mfaSecretEnc: null, mfaEnabledAt: null, mfaLastStep: null } });
        await prisma.session.deleteMany({ where: { userId: existing.id } });
        continue;
      }
      const r = await createStaffUser(prisma, cfg, { actorId: null, email, name: roleKey, password: E2E.password, roleKey, mustChangePassword: false });
      if (!r.ok) throw new Error(r.message);
    }
    await ensureStorefrontFixture(prisma, FIXTURE, 2, "E2EFIX");
    await ensureStorefrontFixture(prisma, CHECKOUT_FIXTURE, 40, "E2ECHK");
    const settings = { taxMode: "UNSET", shippingFlatPaise: 9900, freeShippingThresholdPaise: 1_000_000, codEnabled: true, codFeePaise: 5000, codMaxOrderPaise: null, reservationMinutes: 15, legalName: "", gstin: "", businessAddress: "", businessStateCode: "", invoicePrefix: "", showExactStock: false };
    await prisma.setting.upsert({ where: { key: "business" }, update: { data: settings }, create: { key: "business", data: settings } });
    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { email: E2E.saEmail },
      data: { mfaSecretEnc: encrypt(secret, key), mfaEnabledAt: new Date() },
    });
    process.env.E2E_SA_TOTP_SECRET = secret;
    // Expose to test workers through a file-free channel: Playwright forwards process.env set in globalSetup.
  } finally {
    await prisma.$disconnect();
  }
  return async () => {
    fake.close();
  };
}

/** Test double of the Razorpay Orders API using the documented request/response shape. Lives only in e2e. */
function startFakeRazorpay(): Promise<Server> {
  let n = 0;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const auth = req.headers.authorization ?? "";
      const expected = `Basic ${Buffer.from(`${RZP.keyId}:${RZP.keySecret}`).toString("base64")}`;
      if (req.method !== "POST" || req.url !== "/v1/orders" || auth !== expected) {
        res.writeHead(401).end("{}");
        return;
      }
      const o = JSON.parse(body) as { amount: number; currency: string; receipt: string };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: `order_e2e_${Date.now()}_${++n}`, entity: "order", amount: o.amount, currency: o.currency, receipt: o.receipt, status: "created" }));
    });
  });
  return new Promise((resolve) => server.listen(RZP.port, () => resolve(server)));
}

/** Test fixture: one published product (M in stock ×2, L out of stock) with a real uploaded image. Never used outside e2e. */
async function ensureStorefrontFixture(prisma: ReturnType<typeof createPrisma>, fx: { name: string; slug: string; pricePaise: number }, stockM: number, parentCode: string): Promise<void> {
  const existing = await prisma.product.findUnique({ where: { slug: fx.slug }, include: { variants: { where: { size: "M" } } } });
  if (existing) {
    // The test DB persists across runs: top the fixture stock up so earlier runs cannot exhaust it.
    const m = existing.variants[0];
    const actor0 = await prisma.user.findUniqueOrThrow({ where: { email: E2E.smEmail } });
    const loc0 = await prisma.stockLocation.findUniqueOrThrow({ where: { code: "MAIN" } });
    if (m) {
      const bal = await prisma.inventoryBalance.findFirst({ where: { variantId: m.id, locationId: loc0.id } });
      await setOnHand(prisma, { variantId: m.id, locationId: loc0.id, target: (bal?.reserved ?? 0) + stockM, reason: "e2e fixture top-up", actorId: actor0.id });
    }
    return;
  }
  const actor = await prisma.user.findUniqueOrThrow({ where: { email: E2E.smEmail } });
  const location = await prisma.stockLocation.findUniqueOrThrow({ where: { code: "MAIN" } });
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: "premium-wear" } });
  const fields: ProductFields = {
    name: fx.name, description: "Fixture product for automated tests.", categoryId: category.id, pricePaise: fx.pricePaise,
    comparePricePaise: fx.pricePaise === FIXTURE.pricePaise ? 299900 : null, parentCode, hsnCode: null, fabric: "Chanderi", fit: "Straight", neckline: null, sleeveLength: null,
    garmentLength: null, pattern: null, careInstructions: "Dry clean only.", sizeChart: { columns: ["Size", "Bust"], rows: [["M", "36"], ["L", "38"]] },
    isFeatured: true, isNewArrival: true, showOnHomepage: true, tryOnEligible: false, seoTitle: null, seoDescription: null,
  };
  const p = await createProduct(prisma, fields, actor.id);
  if (!p.ok) throw new Error(p.message);
  // createProduct derives the slug from the name, which equals FIXTURE.slug.
  const m = await addVariant(prisma, p.id, { size: "M", colour: "Ivory", sku: `${parentCode}-M`, pricePaise: null }, actor.id);
  const l = await addVariant(prisma, p.id, { size: "L", colour: "Ivory", sku: `${parentCode}-L`, pricePaise: null }, actor.id);
  if (!m.ok || !l.ok) throw new Error("fixture variants");
  await adjustOnHand(prisma, { variantId: m.id, locationId: location.id, delta: stockM, reason: "e2e fixture", actorId: actor.id });
  const file = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#d4bea5" } }).jpeg().toBuffer();
  const storage = new LocalDiskStorage(process.env.E2E_STORAGE_DIR ?? "");
  const img = await addProductImage(prisma, storage, { productId: p.id, file, altText: "Ivory Chanderi kurti, front", actorId: actor.id });
  if (!img.ok) throw new Error(img.message);
  const pub = await publishProduct(prisma, p.id, actor.id);
  if (!pub.ok) throw new Error(pub.message);
}
