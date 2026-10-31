import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrisma } from "@tanvi/database";
import { settingsSchema, whatsappConfigSchema, type WhatsAppConfig } from "@tanvi/validation";
import { seedCore } from "../../packages/database/src/seed-core";
import { addToCart, createCart } from "../../apps/web/src/server/cart/service";
import { adjustOnHand } from "../../apps/web/src/server/catalog/inventory";
import { enqueueOrderEvent, hasMarketingConsent, MAX_ATTEMPTS, processOutbox } from "../../apps/web/src/server/messaging/outbox";
import { MessagingError, type SendTemplateInput, type WhatsAppProvider } from "../../apps/web/src/server/messaging/provider";
import { confirmOrder, placeOrder } from "../../apps/web/src/server/orders/service";

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

/** Test double implementing the port. It is NOT a WhatsApp provider and proves nothing about any real one. */
class FakeProvider implements WhatsAppProvider {
  readonly name = "test-double";
  sent: SendTemplateInput[] = [];
  constructor(private readonly behave: (n: number) => "ok" | "retry" | "fatal" = () => "ok") {}
  async sendTemplate(i: SendTemplateInput) {
    const n = this.sent.push(i);
    const b = this.behave(n);
    if (b === "retry") throw new MessagingError("temporary failure", true);
    if (b === "fatal") throw new MessagingError("invalid template", false);
    return { providerMessageId: `msg_${n}` };
  }
}

d("WhatsApp outbox (real PostgreSQL, test-double provider)", () => {
  const prisma = createPrisma(url ?? "");
  const run = randomBytes(3).toString("hex");
  const phone10 = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
  const to = `91${phone10}`;
  let actorId = "";
  let variantId = "";

  const cfg = (over: Partial<WhatsAppConfig> = {}): WhatsAppConfig =>
    whatsappConfigSchema.parse({ testMode: true, allowedNumbers: [to], templates: { "order.received": { name: "order_received", language: "en", variables: ["customer_name", "reference", "total"] }, "order.confirmed": { name: "order_confirmed", language: "en", variables: ["reference"] } }, ...over });
  const setCfg = (c: WhatsAppConfig) => prisma.setting.upsert({ where: { key: "whatsapp" }, update: { data: c }, create: { key: "whatsapp", data: c } });

  async function codOrder(email = `ob-${run}@example.test`, phone = phone10) {
    const loc = await prisma.stockLocation.findUniqueOrThrow({ where: { code: "MAIN" } });
    const cat = await prisma.category.findUniqueOrThrow({ where: { slug: "regular-wear" } });
    const p = await prisma.product.create({ data: { slug: `ob-${run}-${Math.random().toString(36).slice(2, 7)}`, name: "Outbox Test", categoryId: cat.id, pricePaise: 150000, status: "PUBLISHED", publishedAt: new Date() } });
    const v = await prisma.productVariant.create({ data: { productId: p.id, sku: `OB-${randomUUID().slice(0, 8)}`.toUpperCase(), size: "M", colour: "Rose" } });
    variantId = v.id;
    await adjustOnHand(prisma, { variantId: v.id, locationId: loc.id, delta: 3, reason: "setup", actorId });
    const c = await createCart(prisma);
    await addToCart(prisma, c.id, v.id, 1);
    const r = await placeOrder(prisma, { cartId: c.id, provider: null, settings: settingsSchema.parse({ codEnabled: true }), input: { name: "Priya Nair", email, phone, line1: "1 Road", city: "Kochi", state: "Kerala", pincode: "682001", paymentMethod: "COD", idempotencyKey: randomUUID() } });
    if (!r.ok) throw new Error(r.message);
    return r.orderId;
  }

  beforeAll(async () => {
    await seedCore(prisma);
    actorId = (await prisma.user.create({ data: { email: `ob-${run}@example.test`, name: "ob", passwordHash: "x" } })).id;
    await prisma.outboxMessage.updateMany({ where: { status: "PENDING" }, data: { status: "SKIPPED", lastError: "cleared by test setup" } });
    await setCfg(cfg());
  });
  afterAll(async () => prisma.$disconnect());

  it("a committed COD order records one pending message with ordered variables; replays do not duplicate", async () => {
    const orderId = await codOrder();
    const rows = await prisma.outboxMessage.findMany({ where: { orderId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event: "order.received", status: "PENDING", templateName: "order_received", toPhone: to, purpose: "TRANSACTIONAL" });
    expect(rows[0]?.variables).toEqual(["Priya", expect.stringMatching(/^TNV-/), "₹1,500"]);
    await enqueueOrderEvent(prisma, orderId, "order.received");
    expect(await prisma.outboxMessage.count({ where: { orderId } })).toBe(1);
  });

  it("skips (visibly) events without a template and numbers outside the test-mode allow-list", async () => {
    const orderId = await codOrder();
    await enqueueOrderEvent(prisma, orderId, "order.delivered");
    expect(await prisma.outboxMessage.findFirstOrThrow({ where: { orderId, event: "order.delivered" } })).toMatchObject({ status: "SKIPPED", lastError: "No template configured for this event" });
    const other = await codOrder(`ob2-${run}@example.test`, "9000000001");
    expect(await prisma.outboxMessage.findFirstOrThrow({ where: { orderId: other, event: "order.received" } })).toMatchObject({ status: "SKIPPED", lastError: expect.stringContaining("allow-list") });
    await setCfg(cfg({ testMode: false }));
    const live = await codOrder(`ob3-${run}@example.test`, "9000000002");
    expect(await prisma.outboxMessage.findFirstOrThrow({ where: { orderId: live, event: "order.received" } })).toMatchObject({ status: "PENDING" });
    await setCfg(cfg());
  });

  it("with no provider configured nothing is sent and no attempts are consumed", async () => {
    const orderId = await codOrder();
    const r = await processOutbox(prisma, null);
    expect(r).toMatchObject({ processed: 0, reason: "provider_not_configured" });
    expect(await prisma.outboxMessage.findFirstOrThrow({ where: { orderId } })).toMatchObject({ status: "PENDING", attempts: 0 });
  });

  it("sends once, records the provider message id, and does not resend", async () => {
    const orderId = await codOrder();
    const p = new FakeProvider();
    await processOutbox(prisma, p, new Date());
    const m = await prisma.outboxMessage.findFirstOrThrow({ where: { orderId } });
    expect(m).toMatchObject({ status: "SENT", attempts: 1 });
    expect(m.providerMessageId).toMatch(/^msg_/);
    const before = p.sent.length;
    await processOutbox(prisma, p, new Date(Date.now() + 86_400_000));
    expect(p.sent.length).toBe(before);
    expect(p.sent.find((s) => s.idempotencyKey === m.dedupeKey)?.to).toBe(to);
  });

  it("retries transient failures with backoff, then marks DEAD after the maximum attempts", async () => {
    const orderId = await codOrder();
    const p = new FakeProvider(() => "retry");
    let now = new Date();
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      await processOutbox(prisma, p, now);
      const m = await prisma.outboxMessage.findFirstOrThrow({ where: { orderId } });
      expect(m.attempts).toBe(i);
      if (i < MAX_ATTEMPTS) {
        expect(m.status).toBe("PENDING");
        expect(m.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
        await processOutbox(prisma, p, now); // not due again yet
        expect((await prisma.outboxMessage.findFirstOrThrow({ where: { orderId } })).attempts).toBe(i);
        now = new Date(m.nextAttemptAt.getTime() + 1000);
      }
    }
    expect(await prisma.outboxMessage.findFirstOrThrow({ where: { orderId } })).toMatchObject({ status: "DEAD", lastError: "temporary failure" });
  });

  it("non-retryable errors fail immediately and are not retried", async () => {
    const orderId = await codOrder();
    await processOutbox(prisma, new FakeProvider(() => "fatal"), new Date());
    expect(await prisma.outboxMessage.findFirstOrThrow({ where: { orderId } })).toMatchObject({ status: "FAILED", attempts: 1 });
  });

  it("two workers running at once never send the same message twice", async () => {
    const ids = await Promise.all(Array.from({ length: 6 }, () => codOrder()));
    const p = new FakeProvider();
    await Promise.all([processOutbox(prisma, p, new Date(), 10), processOutbox(prisma, p, new Date(), 10), processOutbox(prisma, p, new Date(), 10)]);
    const mine = await prisma.outboxMessage.findMany({ where: { orderId: { in: ids } } });
    expect(mine.every((m) => m.status === "SENT" && m.attempts === 1)).toBe(true);
    const keys = p.sent.map((s) => s.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("staff confirming an order queues the confirmed message after the change is committed", async () => {
    const orderId = await codOrder();
    expect((await confirmOrder(prisma, orderId, { actorId })).ok).toBe(true);
    expect(await prisma.outboxMessage.findFirstOrThrow({ where: { orderId, event: "order.confirmed" } })).toMatchObject({ status: "PENDING", variables: [expect.stringMatching(/^TNV-/)] });
  });

  it("marketing requires a recorded, un-withdrawn opt-in; transactional consent is separate", async () => {
    const phone = `91${phone10}`;
    expect(await hasMarketingConsent(prisma, phone)).toBe(false);
    const c = await prisma.customerConsent.create({ data: { purpose: "marketing_whatsapp", noticeVersion: "v1", locale: "en", noticeText: "I agree to marketing messages.", phone } });
    expect(await hasMarketingConsent(prisma, phone)).toBe(true);
    await prisma.customerConsent.update({ where: { id: c.id }, data: { withdrawnAt: new Date() } });
    expect(await hasMarketingConsent(prisma, phone)).toBe(false);
    expect(variantId).not.toBe("");
  });
});
