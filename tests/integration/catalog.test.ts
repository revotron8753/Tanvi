import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrisma } from "@tanvi/database";
import { seedCore } from "../../packages/database/src/seed-core";
import {
  adjustOnHand,
  classifyAvailability,
  commitReservedSale,
  recordStoreSale,
  releaseReservation,
  reserveStock,
  setOnHand,
} from "../../apps/web/src/server/catalog/inventory";
import {
  addProductImage,
  addVariant,
  archiveProduct,
  createProduct,
  deleteProductImage,
  duplicateProduct,
  listProducts,
  publishProduct,
  removeVariant,
  reorderImages,
  setPrimaryImage,
  unpublishProduct,
  updateProduct,
  type ProductFields,
} from "../../apps/web/src/server/catalog/products";
import { LocalDiskStorage } from "../../apps/web/src/server/storage";

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("catalogue + inventory services (real PostgreSQL)", () => {
  const prisma = createPrisma(url ?? "");
  const run = randomBytes(3).toString("hex");
  let dir = "";
  let storage: LocalDiskStorage;
  let actorId = "";
  let categoryId = "";
  let locationId = "";

  const fields = (name: string, over: Partial<ProductFields> = {}): ProductFields => ({
    name,
    description: null,
    categoryId,
    pricePaise: 349900,
    comparePricePaise: null,
    parentCode: null,
    hsnCode: null,
    fabric: null,
    fit: null,
    neckline: null,
    sleeveLength: null,
    garmentLength: null,
    pattern: null,
    careInstructions: null,
    isFeatured: false,
    isNewArrival: false,
    showOnHomepage: false,
    tryOnEligible: false,
    seoTitle: null,
    seoDescription: null,
    ...over,
  });
  const jpeg = (w = 900, h = 1200, bg = "#b5a18b") => sharp({ create: { width: w, height: h, channels: 3, background: bg } }).jpeg().toBuffer();

  async function draftWithVariant(tag: string) {
    const c = await createProduct(prisma, fields(`T${run} ${tag}`), actorId);
    if (!c.ok) throw new Error(c.message);
    const v = await addVariant(prisma, c.id, { size: "M", colour: "Rose", sku: "", pricePaise: null, initialStock: 5 }, actorId);
    if (!v.ok) throw new Error(v.message);
    return { productId: c.id, variantId: v.id };
  }

  beforeAll(async () => {
    await seedCore(prisma);
    dir = await mkdtemp(path.join(os.tmpdir(), "tanvi-storage-"));
    storage = new LocalDiskStorage(dir);
    categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "premium-wear" } })).id;
    locationId = (await prisma.stockLocation.findUniqueOrThrow({ where: { code: "MAIN" } })).id;
    const u = await prisma.user.create({ data: { email: `cat-${run}@example.test`, name: "cat", passwordHash: "x" } });
    actorId = u.id;
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
    await prisma.category.deleteMany({ where: { slug: `hidden-${run}` } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  describe("products", () => {
    it("creates drafts with unique slugs and rejects bad input", async () => {
      const a = await createProduct(prisma, fields(`Slug ${run}`), actorId);
      const b = await createProduct(prisma, fields(`Slug ${run}`), actorId);
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      const [pa, pb] = await Promise.all([prisma.product.findUniqueOrThrow({ where: { id: a.id } }), prisma.product.findUniqueOrThrow({ where: { id: b.id } })]);
      expect(pa.slug).not.toBe(pb.slug);
      expect(pa.status).toBe("DRAFT");
      expect((await createProduct(prisma, fields("x"), actorId)).ok).toBe(false);
      expect((await createProduct(prisma, fields(`Bad ${run}`, { pricePaise: 1000, comparePricePaise: 500 }), actorId)).ok).toBe(false);
    });

    it("refuses to publish until essentials exist, then publishes; unpublish and archive work", async () => {
      const { productId } = await draftWithVariant("pub");
      const early = await publishProduct(prisma, productId, actorId);
      expect(early).toMatchObject({ ok: false, message: expect.stringContaining("image") });

      const up = await addProductImage(prisma, storage, { productId, file: await jpeg(), altText: "Rose kurti front", actorId });
      expect(up.ok).toBe(true);
      // Uploading an image must not publish the product.
      expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).status).toBe("DRAFT");

      expect((await publishProduct(prisma, productId, actorId)).ok).toBe(true);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).status).toBe("PUBLISHED");
      expect((await unpublishProduct(prisma, productId, actorId)).ok).toBe(true);
      expect((await archiveProduct(prisma, productId, actorId)).ok).toBe(true);
      expect((await archiveProduct(prisma, productId, actorId)).ok).toBe(false);
    });

    it("blocks publishing with missing alt text or an unpublished category", async () => {
      const { productId } = await draftWithVariant("alt");
      await addProductImage(prisma, storage, { productId, file: await jpeg(), altText: "  ", actorId });
      expect(await publishProduct(prisma, productId, actorId)).toMatchObject({ ok: false, message: expect.stringContaining("alt text") });
      const cat = await prisma.category.create({ data: { slug: `hidden-${run}`, name: "Hidden", isPublished: false } });
      await updateProduct(prisma, productId, fields(`T${run} alt`, { categoryId: cat.id }), actorId);
      expect(await publishProduct(prisma, productId, actorId)).toMatchObject({ ok: false });
    });

    it("updates fields and keeps slug stable unless changed", async () => {
      const { productId } = await draftWithVariant("upd");
      const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect((await updateProduct(prisma, productId, fields(`T${run} upd renamed`, { fabric: "Cotton" }), actorId)).ok).toBe(true);
      const after = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(after.slug).toBe(before.slug);
      expect(after.fabric).toBe("Cotton");
    });

    it("duplicates as a draft with zero stock and no images", async () => {
      const { productId } = await draftWithVariant("dupe");
      const copy = await duplicateProduct(prisma, productId, actorId);
      if (!copy.ok) throw new Error(copy.message);
      const p = await prisma.product.findUniqueOrThrow({ where: { id: copy.id }, include: { variants: { include: { balances: true } }, images: true } });
      expect(p.status).toBe("DRAFT");
      expect(p.images).toHaveLength(0);
      expect(p.variants).toHaveLength(1);
      expect(p.variants[0]?.balances).toHaveLength(0);
    });

    it("lists with search, status filter and pagination", async () => {
      const found = await listProducts(prisma, { q: `T${run} pub`, page: 1, pageSize: 10 });
      expect(found.total).toBeGreaterThanOrEqual(1);
      const bySku = await listProducts(prisma, { q: "ROSE", page: 1, pageSize: 2 });
      expect(bySku.items.length).toBeLessThanOrEqual(2);
      const drafts = await listProducts(prisma, { status: "DRAFT", categoryId, page: 1, pageSize: 5 });
      expect(drafts.items.every((i) => i.status === "DRAFT")).toBe(true);
    });
  });

  describe("variants", () => {
    it("auto-generates SKUs, enforces uniqueness, seeds opening stock", async () => {
      const { productId, variantId } = await draftWithVariant("var");
      const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { balances: true } });
      expect(v.sku).toMatch(/^[A-Z0-9-]+$/);
      expect(v.balances[0]?.onHand).toBe(5);
      expect(await addVariant(prisma, productId, { size: "M", colour: "Rose", sku: "", pricePaise: null }, actorId)).toMatchObject({ ok: false });
      expect(await addVariant(prisma, productId, { size: "L", colour: "Rose", sku: v.sku, pricePaise: null }, actorId)).toMatchObject({ ok: false });
      expect((await addVariant(prisma, productId, { size: "L", colour: "Rose", sku: "", pricePaise: 399900 }, actorId)).ok).toBe(true);
    });

    it("hard-deletes untouched variants but only deactivates ones with stock history", async () => {
      const { productId, variantId } = await draftWithVariant("rm");
      expect((await removeVariant(prisma, variantId, actorId)).ok).toBe(true);
      expect(await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).toMatchObject({ isActive: false });
      const fresh = await addVariant(prisma, productId, { size: "XL", colour: "Teal", sku: "", pricePaise: null }, actorId);
      if (!fresh.ok) throw new Error(fresh.message);
      expect((await removeVariant(prisma, fresh.id, actorId)).ok).toBe(true);
      expect(await prisma.productVariant.findUnique({ where: { id: fresh.id } })).toBeNull();
    });
  });

  describe("images", () => {
    it("stores three renditions, makes the first image primary, reorders, re-primaries on delete, and cleans storage", async () => {
      const { productId } = await draftWithVariant("img");
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await addProductImage(prisma, storage, { productId, file: await jpeg(900 + i, 1200), altText: `view ${i}`, actorId });
        if (!r.ok) throw new Error(r.message);
        ids.push(r.id);
      }
      const imgs = await prisma.productImage.findMany({ where: { productId }, orderBy: { position: "asc" } });
      expect(imgs.map((i) => i.isPrimary)).toEqual([true, false, false]);
      expect(await readdir(path.join(dir, imgs[0]?.storageKey ?? "x"))).toEqual(expect.arrayContaining(["thumb.webp", "md.webp", "lg.webp"]));

      expect((await reorderImages(prisma, productId, [ids[2] ?? "", ids[0] ?? "", ids[1] ?? ""], actorId)).ok).toBe(true);
      expect((await prisma.productImage.findMany({ where: { productId }, orderBy: { position: "asc" } })).map((i) => i.id)).toEqual([ids[2], ids[0], ids[1]]);
      expect((await reorderImages(prisma, productId, [ids[0] ?? ""], actorId)).ok).toBe(false);

      expect((await setPrimaryImage(prisma, ids[1] ?? "", actorId)).ok).toBe(true);
      expect((await prisma.productImage.findMany({ where: { productId, isPrimary: true } })).map((i) => i.id)).toEqual([ids[1]]);

      const key = (await prisma.productImage.findUniqueOrThrow({ where: { id: ids[1] ?? "" } })).storageKey;
      expect((await deleteProductImage(prisma, storage, ids[1] ?? "", actorId)).ok).toBe(true);
      expect(await storage.get(`${key}/md.webp`)).toBeNull();
      expect(await prisma.productImage.count({ where: { productId, isPrimary: true } })).toBe(1);
    });

    it("rejects invalid files without leaving rows or files behind", async () => {
      const { productId } = await draftWithVariant("badimg");
      const r = await addProductImage(prisma, storage, { productId, file: Buffer.from("<script>alert(1)</script>"), altText: "x", actorId });
      expect(r.ok).toBe(false);
      expect(await prisma.productImage.count({ where: { productId } })).toBe(0);
    });

    it("will not delete the last image of a published product", async () => {
      const { productId } = await draftWithVariant("last");
      const up = await addProductImage(prisma, storage, { productId, file: await jpeg(), altText: "front", actorId });
      if (!up.ok) throw new Error(up.message);
      await publishProduct(prisma, productId, actorId);
      expect(await deleteProductImage(prisma, storage, up.id, actorId)).toMatchObject({ ok: false });
    });
  });

  describe("inventory", () => {
    async function stocked(qty: number) {
      const { variantId } = await draftWithVariant(`inv${Math.random().toString(36).slice(2, 6)}`);
      expect((await setOnHand(prisma, { variantId, locationId, target: qty, reason: "test setup", actorId })).ok).toBe(true);
      return variantId;
    }
    const bal = (variantId: string) => prisma.inventoryBalance.findFirstOrThrow({ where: { variantId, locationId } });

    it("requires a reason and refuses to go below reserved", async () => {
      const v = await stocked(5);
      expect(await adjustOnHand(prisma, { variantId: v, locationId, delta: -1, reason: "", actorId })).toMatchObject({ ok: false });
      await reserveStock(prisma, { variantId: v, locationId, quantity: 4, reference: "t" });
      expect(await adjustOnHand(prisma, { variantId: v, locationId, delta: -2, reason: "damaged", actorId })).toMatchObject({ ok: false, reason: "below_reserved" });
      expect(await adjustOnHand(prisma, { variantId: v, locationId, delta: -1, reason: "damaged", actorId })).toEqual({ ok: true });
    });

    it("reserve → commit and reserve → release keep on-hand/reserved consistent and write the ledger", async () => {
      const v = await stocked(10);
      await reserveStock(prisma, { variantId: v, locationId, quantity: 3, reference: "o1" });
      await reserveStock(prisma, { variantId: v, locationId, quantity: 2, reference: "o2" });
      expect(await bal(v)).toMatchObject({ onHand: 10, reserved: 5 });
      await commitReservedSale(prisma, { variantId: v, locationId, quantity: 3, reference: "o1" });
      await releaseReservation(prisma, { variantId: v, locationId, quantity: 2, reference: "o2", reason: "expired" });
      expect(await bal(v)).toMatchObject({ onHand: 7, reserved: 0 });
      const types = (await prisma.inventoryMovement.findMany({ where: { variantId: v }, orderBy: { createdAt: "asc" } })).map((m) => m.type);
      expect(types).toEqual(expect.arrayContaining(["RESERVE", "SALE", "RELEASE"]));
      const sum = (await prisma.inventoryMovement.findMany({ where: { variantId: v } })).reduce((s, m) => s + m.deltaOnHand, 0);
      expect(sum).toBe(7); // ledger reconciles to the balance
    });

    it("never oversells under concurrent reservations (30 buyers, 7 units)", async () => {
      const v = await stocked(7);
      const results = await Promise.all(Array.from({ length: 30 }, (_, i) => reserveStock(prisma, { variantId: v, locationId, quantity: 1, reference: `c${i}` })));
      expect(results.filter((r) => r.ok)).toHaveLength(7);
      expect(await bal(v)).toMatchObject({ onHand: 7, reserved: 7 });
      expect(await prisma.inventoryMovement.count({ where: { variantId: v, type: "RESERVE" } })).toBe(7);
    });

    it("records in-store sales only from available stock", async () => {
      const v = await stocked(2);
      await reserveStock(prisma, { variantId: v, locationId, quantity: 1, reference: "web" });
      expect(await recordStoreSale(prisma, { variantId: v, locationId, quantity: 2, reference: "bill-1", actorId })).toMatchObject({ ok: false, reason: "insufficient_stock" });
      expect(await recordStoreSale(prisma, { variantId: v, locationId, quantity: 1, reference: "bill-2", actorId })).toEqual({ ok: true });
      expect(await bal(v)).toMatchObject({ onHand: 1, reserved: 1 });
    });

    it("rejects zero/negative/fractional quantities", async () => {
      const v = await stocked(3);
      for (const q of [0, -1, 1.5]) expect(await reserveStock(prisma, { variantId: v, locationId, quantity: q, reference: "x" })).toMatchObject({ ok: false });
    });

    it("classifies availability", () => {
      expect(classifyAvailability([{ onHand: 0, reserved: 0, lowStockThreshold: 2 }]).status).toBe("out_of_stock");
      expect(classifyAvailability([{ onHand: 2, reserved: 0, lowStockThreshold: 2 }]).status).toBe("low_stock");
      expect(classifyAvailability([{ onHand: 9, reserved: 2, lowStockThreshold: 2 }])).toEqual({ available: 7, status: "in_stock" });
      expect(classifyAvailability([{ onHand: 3, reserved: 3, lowStockThreshold: 2 }]).status).toBe("out_of_stock");
    });
  });
});
