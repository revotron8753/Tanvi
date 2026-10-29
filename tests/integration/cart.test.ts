import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrisma } from "@tanvi/database";
import { seedCore } from "../../packages/database/src/seed-core";
import { addToCart, createCart, createWishlist, findCartByToken, removeFromCart, setCartQuantity, toggleWishlist, viewCart } from "../../apps/web/src/server/cart/service";
import { adjustOnHand, reserveStock } from "../../apps/web/src/server/catalog/inventory";
import { getLiveProductBySlug, listShopProducts, shopFacets } from "../../apps/web/src/server/storefront/queries";

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("storefront queries + cart (real PostgreSQL)", () => {
  const prisma = createPrisma(url ?? "");
  const run = randomBytes(3).toString("hex");
  let actorId = "";
  let locationId = "";
  let categoryId = "";
  let live: { productId: string; slug: string; variantM: string; variantL: string };
  let draftVariant = "";

  async function product(tag: string, status: "PUBLISHED" | "DRAFT", over: { price?: number; fabric?: string } = {}) {
    const p = await prisma.product.create({
      data: { slug: `sf-${run}-${tag}`, name: `Storefront ${run} ${tag}`, categoryId, pricePaise: over.price ?? 199900, status, publishedAt: status === "PUBLISHED" ? new Date() : null, fabric: over.fabric ?? "Cotton" },
    });
    const mk = (size: string, colour = "Rose") => prisma.productVariant.create({ data: { productId: p.id, sku: `SF-${run}-${tag}-${size}`.toUpperCase(), size, colour } });
    const [m, l] = await Promise.all([mk("M"), mk("L")]);
    return { p, m, l };
  }

  beforeAll(async () => {
    await seedCore(prisma);
    categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "festive-wear" } })).id;
    locationId = (await prisma.stockLocation.findUniqueOrThrow({ where: { code: "MAIN" } })).id;
    actorId = (await prisma.user.create({ data: { email: `sf-${run}@example.test`, name: "sf", passwordHash: "x" } })).id;
    const a = await product("live", "PUBLISHED");
    await adjustOnHand(prisma, { variantId: a.m.id, locationId, delta: 3, reason: "setup", actorId });
    live = { productId: a.p.id, slug: a.p.slug, variantM: a.m.id, variantL: a.l.id };
    const b = await product("draft", "DRAFT");
    await adjustOnHand(prisma, { variantId: b.m.id, locationId, delta: 5, reason: "setup", actorId });
    draftVariant = b.m.id;
  });
  afterAll(async () => prisma.$disconnect());

  it("only published products in published categories are visible", async () => {
    const all = await listShopProducts(prisma, { q: `Storefront ${run}`, page: 1, pageSize: 20 });
    expect(all.items.map((i) => i.slug)).toEqual([live.slug]);
    expect(await getLiveProductBySlug(prisma, `sf-${run}-draft`)).toBeNull();
    await prisma.category.update({ where: { id: categoryId }, data: { isPublished: false } });
    expect((await listShopProducts(prisma, { q: `Storefront ${run}`, page: 1, pageSize: 20 })).total).toBe(0);
    await prisma.category.update({ where: { id: categoryId }, data: { isPublished: true } });
  });

  it("filters, sorts and paginates", async () => {
    await product("cheap", "PUBLISHED", { price: 99900, fabric: "Silk" });
    const base = { q: `Storefront ${run}`, page: 1, pageSize: 10 } as const;
    const asc = await listShopProducts(prisma, { ...base, sort: "price_asc" });
    expect(asc.items.map((i) => i.pricePaise)).toEqual([99900, 199900]);
    expect((await listShopProducts(prisma, { ...base, fabric: "silk" })).total).toBe(1);
    expect((await listShopProducts(prisma, { ...base, minPaise: 150000 })).total).toBe(1);
    expect((await listShopProducts(prisma, { ...base, sizes: ["L"] })).total).toBe(2);
    expect((await listShopProducts(prisma, { ...base, colours: ["Nonexistent"] })).total).toBe(0);
    expect((await listShopProducts(prisma, { ...base, pageSize: 1, page: 2, sort: "price_asc" })).items.map((i) => i.pricePaise)).toEqual([199900]);
    const facets = await shopFacets(prisma, "festive-wear");
    expect(facets.sizes).toEqual(expect.arrayContaining(["L", "M"]));
    expect(facets.fabrics).toEqual(expect.arrayContaining(["Cotton", "Silk"]));
  });

  it("search is safe against LIKE wildcards and injection-looking input", async () => {
    expect((await listShopProducts(prisma, { q: `'; DROP TABLE "Product"; --`, page: 1, pageSize: 5 })).total).toBe(0);
    expect(await prisma.product.count()).toBeGreaterThan(0);
  });

  it("adds to cart with server-side validation of stock, max qty and liveness", async () => {
    const { id, token } = await createCart(prisma);
    expect((await findCartByToken(prisma, token))?.id).toBe(id);
    expect((await findCartByToken(prisma, "bogus"))).toBeNull();

    expect((await addToCart(prisma, id, live.variantM, 2)).ok).toBe(true);
    expect(await addToCart(prisma, id, live.variantM, 2)).toMatchObject({ ok: false, message: "Only 3 left in this size." });
    expect(await addToCart(prisma, id, live.variantL, 1)).toMatchObject({ ok: false, message: expect.stringContaining("out of stock") });
    expect(await addToCart(prisma, id, draftVariant, 1)).toMatchObject({ ok: false, message: expect.stringContaining("no longer available") });
    for (const q of [0, -1, 1.5, 11]) expect((await addToCart(prisma, id, live.variantM, q)).ok).toBe(false);

    const v = await viewCart(prisma, id);
    expect(v).toMatchObject({ itemCount: 2, subtotalPaise: 2 * 199900, hasProblems: false });
    expect(v.lines[0]).toMatchObject({ unitPricePaise: 199900, linePricePaise: 399800, problem: null });
  });

  it("recomputes prices from the database (price changes and variant overrides flow through)", async () => {
    const { id } = await createCart(prisma);
    await addToCart(prisma, id, live.variantM, 1);
    await prisma.productVariant.update({ where: { id: live.variantM }, data: { pricePaise: 249900 } });
    expect((await viewCart(prisma, id)).subtotalPaise).toBe(249900);
    await prisma.productVariant.update({ where: { id: live.variantM }, data: { pricePaise: null } });
    await prisma.product.update({ where: { id: live.productId }, data: { pricePaise: 179900 } });
    expect((await viewCart(prisma, id)).subtotalPaise).toBe(179900);
    await prisma.product.update({ where: { id: live.productId }, data: { pricePaise: 199900 } });
  });

  it("flags lines that become unavailable or exceed stock, and excludes them from the subtotal", async () => {
    const { id } = await createCart(prisma);
    await addToCart(prisma, id, live.variantM, 2);
    await reserveStock(prisma, { variantId: live.variantM, locationId, quantity: 2, reference: "someone-else" });
    const v = await viewCart(prisma, id);
    expect(v.hasProblems).toBe(true);
    expect(v.lines[0]).toMatchObject({ problem: "insufficient", available: 1 });
    expect(v.subtotalPaise).toBe(0);
    await prisma.product.update({ where: { id: live.productId }, data: { status: "ARCHIVED" } });
    expect((await viewCart(prisma, id)).lines[0]?.problem).toBe("unavailable");
    await prisma.product.update({ where: { id: live.productId }, data: { status: "PUBLISHED" } });
  });

  it("updates and removes lines", async () => {
    const { id } = await createCart(prisma);
    await addToCart(prisma, id, live.variantM, 1);
    expect((await setCartQuantity(prisma, id, live.variantM, 3)).ok).toBe(false); // only 1 available after earlier reservation
    expect((await setCartQuantity(prisma, id, live.variantM, 0)).ok).toBe(true);
    expect((await viewCart(prisma, id)).lines).toHaveLength(0);
    await addToCart(prisma, id, live.variantM, 1);
    await removeFromCart(prisma, id, live.variantM);
    expect((await viewCart(prisma, id)).itemCount).toBe(0);
  });

  it("wishlist toggles, ignores non-live products, and is capped", async () => {
    const w = await createWishlist(prisma);
    expect(await toggleWishlist(prisma, w.id, live.productId)).toEqual({ saved: true });
    expect(await toggleWishlist(prisma, w.id, live.productId)).toEqual({ saved: false });
    const draft = await prisma.productVariant.findUniqueOrThrow({ where: { id: draftVariant } });
    expect(await toggleWishlist(prisma, w.id, draft.productId)).toEqual({ saved: false });
    expect(await prisma.wishlistItem.count({ where: { wishlistId: w.id } })).toBe(0);
  });
});
