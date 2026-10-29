import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrisma } from "@tanvi/database";
import { settingsSchema } from "@tanvi/validation";
import { seedCore } from "../../packages/database/src/seed-core";
import { addToCart, createCart } from "../../apps/web/src/server/cart/service";
import { adjustOnHand } from "../../apps/web/src/server/catalog/inventory";
import { markPaid, placeOrder } from "../../apps/web/src/server/orders/service";
import { createRazorpay } from "../../apps/web/src/server/payments/razorpay";
import { parseRange, salesSummary } from "../../apps/web/src/server/reports/queries";

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

describe("parseRange (pure)", () => {
  it("uses whole IST days and orders reversed ranges", () => {
    const r = parseRange("2026-03-05", "2026-03-01");
    expect(r.fromText).toBe("2026-03-01");
    expect(r.from.toISOString()).toBe("2026-02-28T18:30:00.000Z");
    expect(r.toExclusive.toISOString()).toBe("2026-03-05T18:30:00.000Z");
  });
  it("falls back to the last 30 days for junk", () => {
    const r = parseRange("nope", undefined, new Date("2026-10-29T10:00:00Z"));
    expect(r.toText).toBe("2026-10-29");
    expect(r.fromText).toBe("2026-09-30");
  });
});

d("sales summary (real PostgreSQL)", () => {
  const prisma = createPrisma(url ?? "");
  const run = randomBytes(3).toString("hex");
  const provider = createRazorpay({ keyId: "k", keySecret: "s", webhookSecret: null, fetchImpl: (async (_u: string, i: RequestInit) => new Response(JSON.stringify({ id: `order_${run}_${Math.random()}`, amount: (JSON.parse(String(i.body)) as { amount: number }).amount, currency: "INR", status: "created" }))) as unknown as typeof fetch });
  let actorId = "";

  beforeAll(async () => {
    await seedCore(prisma);
    actorId = (await prisma.user.create({ data: { email: `rep-${run}@example.test`, name: "rep", passwordHash: "x" } })).id;
  });
  afterAll(async () => prisma.$disconnect());

  it("counts only real orders, with paid sales independent of placed orders, in a narrow window", async () => {
    const start = new Date();
    const cat = await prisma.category.findUniqueOrThrow({ where: { slug: "regular-wear" } });
    const loc = await prisma.stockLocation.findUniqueOrThrow({ where: { code: "MAIN" } });
    const p = await prisma.product.create({ data: { slug: `rep-${run}`, name: `Report ${run}`, categoryId: cat.id, pricePaise: 100000, status: "PUBLISHED", publishedAt: new Date() } });
    const v = await prisma.productVariant.create({ data: { productId: p.id, sku: `REP-${run}`.toUpperCase(), size: "M", colour: "Rose" } });
    await adjustOnHand(prisma, { variantId: v.id, locationId: loc.id, delta: 10, reason: "setup", actorId });
    const settings = settingsSchema.parse({ taxMode: "UNSET" });
    const mk = async (cod: boolean) => {
      const c = await createCart(prisma);
      await addToCart(prisma, c.id, v.id, 2);
      const r = await placeOrder(prisma, { cartId: c.id, settings, provider, input: { name: "A B", email: `r-${run}@example.test`, phone: "9876543210", line1: "1 Road", city: "Pune", state: "Maharashtra", pincode: "411001", paymentMethod: cod ? "COD" : "ONLINE", idempotencyKey: randomUUID() } });
      if (!r.ok) throw new Error(r.message);
      return r;
    };
    const online = await mk(false);
    await mk(false); // stays unpaid
    const pa = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: online.orderId } });
    await markPaid(prisma, { providerOrderId: pa.providerOrderId, providerPaymentId: "pay", amountPaise: pa.amountPaise });

    const window = { from: new Date(start.getTime() - 1000), toExclusive: new Date(Date.now() + 60_000), fromText: "", toText: "" };
    const s = await salesSummary(prisma, window);
    expect(s.ordersPlaced).toBeGreaterThanOrEqual(2);
    const mine = await prisma.order.findMany({ where: { items: { some: { variantId: v.id } } } });
    expect(mine).toHaveLength(2);
    expect(s.paidSalesPaise).toBeGreaterThanOrEqual(200000);
    const top = s.topProducts.find((t) => t.name === `Report ${run}`);
    expect(top?.units).toBe(4);
  });
});
