import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrisma } from "@tanvi/database";
import { seedCore } from "../../packages/database/src/seed-core";

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("database (real PostgreSQL)", () => {
  const prisma = createPrisma(url ?? "");
  const run = randomBytes(3).toString("hex");
  let categoryId = "";
  let locationId = "";

  beforeAll(async () => {
    await seedCore(prisma);
    categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "premium-wear" } })).id;
    locationId = (await prisma.stockLocation.findUniqueOrThrow({ where: { code: "MAIN" } })).id;
  });
  afterAll(async () => {
    // Best effort: products whose variants have ledger rows cannot be deleted (append-only, by design).
    await prisma.product.deleteMany({ where: { slug: { startsWith: `test-${run}` } } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  async function makeVariant(tag: string) {
    const product = await prisma.product.create({
      data: { slug: `test-${run}-${tag}`, name: `Test ${tag}`, categoryId, pricePaise: 199900 },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, sku: `TEST-${run}-${tag}-M`, size: "M", colour: "Rose" },
    });
    return { product, variant };
  }

  it("seed is idempotent and creates the six categories", async () => {
    const snapshot = async () => ({
      cats: await prisma.category.count({ where: { slug: { in: ["regular-wear", "festive-wear", "premium-wear", "three-piece-kurtis", "short-tops", "co-ord-sets"] } } }),
      perms: await prisma.permission.count(),
      roles: await prisma.role.count(),
      rp: await prisma.rolePermission.count(),
      locs: await prisma.stockLocation.count(),
    });
    const before = await snapshot();
    await seedCore(prisma);
    expect(await snapshot()).toEqual(before);
    expect(before.cats).toBe(6);
    expect(before.roles).toBe(6);
  });

  it("seed does not overwrite admin edits to categories", async () => {
    await prisma.category.update({ where: { slug: "short-tops" }, data: { name: "Crop Tops (edited)" } });
    await seedCore(prisma);
    expect((await prisma.category.findUniqueOrThrow({ where: { slug: "short-tops" } })).name).toBe("Crop Tops (edited)");
    await prisma.category.update({ where: { slug: "short-tops" }, data: { name: "Short Tops" } });
  });

  it("rejects negative on-hand stock", async () => {
    const { variant } = await makeVariant("neg");
    await expect(
      prisma.inventoryBalance.create({ data: { variantId: variant.id, locationId, onHand: -1 } }),
    ).rejects.toThrow();
  });

  it("rejects reserved greater than on-hand", async () => {
    const { variant } = await makeVariant("res");
    await expect(
      prisma.inventoryBalance.create({ data: { variantId: variant.id, locationId, onHand: 1, reserved: 2 } }),
    ).rejects.toThrow();
  });

  it("rejects duplicate SKU and duplicate (variant, location)", async () => {
    const { product, variant } = await makeVariant("dup");
    await expect(
      prisma.productVariant.create({ data: { productId: product.id, sku: variant.sku, size: "L", colour: "Rose" } }),
    ).rejects.toThrow();
    await prisma.inventoryBalance.create({ data: { variantId: variant.id, locationId, onHand: 3 } });
    await expect(
      prisma.inventoryBalance.create({ data: { variantId: variant.id, locationId, onHand: 1 } }),
    ).rejects.toThrow();
  });

  it("atomic conditional update prevents overselling under concurrency", async () => {
    const { variant } = await makeVariant("race");
    await prisma.inventoryBalance.create({ data: { variantId: variant.id, locationId, onHand: 5 } });
    const reserveOne = () =>
      prisma.$executeRaw`UPDATE "InventoryBalance" SET "reserved" = "reserved" + 1
        WHERE "variantId" = ${variant.id}::uuid AND "locationId" = ${locationId}::uuid AND "onHand" - "reserved" >= 1`;
    const results = await Promise.all(Array.from({ length: 20 }, reserveOne));
    expect(results.reduce((a, b) => a + b, 0)).toBe(5);
    const bal = await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId: variant.id } });
    expect(bal.reserved).toBe(5);
  });

  it("inventory movements are append-only", async () => {
    const { variant } = await makeVariant("ledger");
    const m = await prisma.inventoryMovement.create({
      data: { variantId: variant.id, locationId, type: "RECEIPT", deltaOnHand: 4, reason: "test" },
    });
    await expect(prisma.inventoryMovement.update({ where: { id: m.id }, data: { reason: "x" } })).rejects.toThrow();
    await expect(prisma.inventoryMovement.delete({ where: { id: m.id } })).rejects.toThrow();
  });

  it("allows only one primary image per product", async () => {
    const { product } = await makeVariant("img");
    await prisma.productImage.create({ data: { productId: product.id, storageKey: "a", altText: "a", isPrimary: true } });
    await expect(
      prisma.productImage.create({ data: { productId: product.id, storageKey: "b", altText: "b", isPrimary: true } }),
    ).rejects.toThrow();
  });
});
