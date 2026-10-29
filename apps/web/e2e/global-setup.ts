import { randomBytes } from "node:crypto";
import { createPrisma } from "@tanvi/database";
import { seedCore } from "../../../packages/database/src/seed-core";
import { encrypt } from "../src/server/auth/crypto";
import { createStaffUser } from "../src/server/auth/service";
import { generateTotpSecret } from "../src/server/auth/totp";
import { adjustOnHand } from "../src/server/catalog/inventory";
import { addProductImage, addVariant, createProduct, publishProduct, type ProductFields } from "../src/server/catalog/products";
import { LocalDiskStorage } from "../src/server/storage";
import sharp from "sharp";

export const FIXTURE = { name: "E2E Storefront Kurti", slug: "e2e-storefront-kurti", pricePaise: 249900 };

export const E2E = {
  password: "e2e passphrase long enough",
  pmEmail: "e2e-pm@example.test",
  saEmail: "e2e-sa@example.test",
  smEmail: "e2e-sm@example.test",
};

/** Seeds the TEST database with real users via the real service code. Fixtures live only here. */
export default async function globalSetup(): Promise<void> {
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
    await ensureStorefrontFixture(prisma, url);
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
}

/** Test fixture: one published product (M in stock ×2, L out of stock) with a real uploaded image. Never used outside e2e. */
async function ensureStorefrontFixture(prisma: ReturnType<typeof createPrisma>, _url: string): Promise<void> {
  if (await prisma.product.findUnique({ where: { slug: FIXTURE.slug } })) return;
  const actor = await prisma.user.findUniqueOrThrow({ where: { email: E2E.smEmail } });
  const location = await prisma.stockLocation.findUniqueOrThrow({ where: { code: "MAIN" } });
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: "premium-wear" } });
  const fields: ProductFields = {
    name: FIXTURE.name, description: "Fixture product for automated tests.", categoryId: category.id, pricePaise: FIXTURE.pricePaise,
    comparePricePaise: 299900, parentCode: "E2EFIX", hsnCode: null, fabric: "Chanderi", fit: "Straight", neckline: null, sleeveLength: null,
    garmentLength: null, pattern: null, careInstructions: "Dry clean only.", sizeChart: { columns: ["Size", "Bust"], rows: [["M", "36"], ["L", "38"]] },
    isFeatured: true, isNewArrival: true, showOnHomepage: true, tryOnEligible: false, seoTitle: null, seoDescription: null,
  };
  const p = await createProduct(prisma, fields, actor.id);
  if (!p.ok) throw new Error(p.message);
  // createProduct derives the slug from the name, which equals FIXTURE.slug.
  const m = await addVariant(prisma, p.id, { size: "M", colour: "Ivory", sku: "E2EFIX-M", pricePaise: null }, actor.id);
  const l = await addVariant(prisma, p.id, { size: "L", colour: "Ivory", sku: "E2EFIX-L", pricePaise: null }, actor.id);
  if (!m.ok || !l.ok) throw new Error("fixture variants");
  await adjustOnHand(prisma, { variantId: m.id, locationId: location.id, delta: 2, reason: "e2e fixture", actorId: actor.id });
  const file = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#d4bea5" } }).jpeg().toBuffer();
  const storage = new LocalDiskStorage(process.env.E2E_STORAGE_DIR ?? "");
  const img = await addProductImage(prisma, storage, { productId: p.id, file, altText: "Ivory Chanderi kurti, front", actorId: actor.id });
  if (!img.ok) throw new Error(img.message);
  const pub = await publishProduct(prisma, p.id, actor.id);
  if (!pub.ok) throw new Error(pub.message);
}
