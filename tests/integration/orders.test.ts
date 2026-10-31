import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrisma } from "@tanvi/database";
import { settingsSchema, type CheckoutInput, type Settings } from "@tanvi/validation";
import { seedCore } from "../../packages/database/src/seed-core";
import { addToCart, createCart } from "../../apps/web/src/server/cart/service";
import { adjustOnHand } from "../../apps/web/src/server/catalog/inventory";
import {
  assignInvoiceNumber,
  cancelOrder,
  confirmOrder,
  expireUnpaidOrders,
  getOrderForToken,
  markDelivered,
  markPaid,
  markRefunded,
  markShipped,
  placeOrder,
} from "../../apps/web/src/server/orders/service";
import { createRazorpay } from "../../apps/web/src/server/payments/razorpay";

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("orders, payments, stock consistency (real PostgreSQL)", () => {
  const prisma = createPrisma(url ?? "");
  const run = randomBytes(3).toString("hex");
  let actorId = "";
  let locationId = "";
  let categoryId = "";
  let counter = 0;

  // A fake Razorpay HTTP endpoint: returns a fresh order id echoing the requested amount (matches the documented response shape).
  const provider = createRazorpay({
    keyId: "rzp_test_x",
    keySecret: "secret",
    webhookSecret: "wh",
    fetchImpl: (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { amount: number };
      return new Response(JSON.stringify({ id: `order_${run}_${++counter}`, amount: body.amount, currency: "INR", status: "created" }), { status: 200 });
    }) as unknown as typeof fetch,
  });

  const settings = (over: Partial<Settings> = {}): Settings => settingsSchema.parse({ taxMode: "INCLUSIVE", shippingFlatPaise: 9900, freeShippingThresholdPaise: 1_000_000, ...over });
  const input = (over: Partial<CheckoutInput> = {}): CheckoutInput => ({
    name: "Asha Verma", email: `asha-${run}@example.test`, phone: "9876543210", line1: "12 MG Road", city: "Pune", state: "Maharashtra", pincode: "411001",
    paymentMethod: "ONLINE", idempotencyKey: randomUUID(), ...over,
  });

  async function variant(stock: number, price = 100000, gst: number | null = 500) {
    const tag = `${run}-${Math.random().toString(36).slice(2, 7)}`;
    const p = await prisma.product.create({ data: { slug: `ord-${tag}`, name: `Order Test ${tag}`, categoryId, pricePaise: price, status: "PUBLISHED", publishedAt: new Date(), gstRateBps: gst, hsnCode: "6104" } });
    const v = await prisma.productVariant.create({ data: { productId: p.id, sku: `ORD-${tag}`.toUpperCase(), size: "M", colour: "Rose" } });
    if (stock > 0) await adjustOnHand(prisma, { variantId: v.id, locationId, delta: stock, reason: "setup", actorId });
    return v;
  }
  const bal = (variantId: string) => prisma.inventoryBalance.findFirstOrThrow({ where: { variantId, locationId } });
  async function cartWith(variantId: string, qty: number) {
    const c = await createCart(prisma);
    const r = await addToCart(prisma, c.id, variantId, qty);
    if (!r.ok) throw new Error(r.message);
    return c.id;
  }
  async function place(variantId: string, qty: number, over: Partial<CheckoutInput> = {}, s = settings()) {
    const cartId = await cartWith(variantId, qty);
    const r = await placeOrder(prisma, { cartId, input: input(over), settings: s, provider });
    if (!r.ok) throw new Error(r.message);
    return { ...r, cartId };
  }

  beforeAll(async () => {
    await seedCore(prisma);
    categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "regular-wear" } })).id;
    locationId = (await prisma.stockLocation.findUniqueOrThrow({ where: { code: "MAIN" } })).id;
    actorId = (await prisma.user.create({ data: { email: `ord-${run}@example.test`, name: "ord", passwordHash: "x" } })).id;
  });
  afterAll(async () => prisma.$disconnect());

  it("places an online order: server-priced, stock reserved, cart emptied, payment attempt created", async () => {
    const v = await variant(5, 105000);
    const o = await place(v.id, 2);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: o.orderId }, include: { items: true, payments: true } });
    expect(order).toMatchObject({ status: "PENDING_PAYMENT", paymentStatus: "UNPAID", subtotalPaise: 210000, shippingPaise: 9900, taxPaise: 10000, totalPaise: 219900, taxMode: "INCLUSIVE" });
    expect(order.items[0]).toMatchObject({ quantity: 2, unitPricePaise: 105000, gstRateBps: 500, taxPaise: 10000, hsnCode: "6104", stockState: "RESERVED" });
    expect(order.payments).toHaveLength(1);
    expect(order.payments[0]).toMatchObject({ amountPaise: 219900, status: "CREATED", provider: "razorpay" });
    expect(await bal(v.id)).toMatchObject({ onHand: 5, reserved: 2 });
    expect(await prisma.cartItem.count({ where: { cartId: o.cartId } })).toBe(0);
    expect(order.reference).toMatch(/^TNV-[A-Z0-9]{8}$/);
  });

  it("payment confirmation commits stock exactly once, even when the callback and webhook repeat", async () => {
    const v = await variant(5);
    const o = await place(v.id, 2);
    const pa = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: o.orderId } });
    const args = { providerOrderId: pa.providerOrderId, providerPaymentId: "pay_1", amountPaise: pa.amountPaise };
    const results = await Promise.all([markPaid(prisma, args), markPaid(prisma, args), markPaid(prisma, args)]);
    expect(results.filter((r) => r === "confirmed")).toHaveLength(1);
    expect(results.filter((r) => r === "already_paid")).toHaveLength(2);
    expect(await markPaid(prisma, args)).toBe("already_paid");
    expect(await bal(v.id)).toMatchObject({ onHand: 3, reserved: 0 });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID", reservationExpiresAt: null });
    expect(await prisma.inventoryMovement.count({ where: { variantId: v.id, type: "SALE" } })).toBe(1);
  });

  it("refuses a payment whose amount differs from the order and leaves the order unpaid", async () => {
    const v = await variant(3);
    const o = await place(v.id, 1);
    const pa = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: o.orderId } });
    expect(await markPaid(prisma, { providerOrderId: pa.providerOrderId, providerPaymentId: "pay_x", amountPaise: pa.amountPaise - 100 })).toBe("amount_mismatch");
    expect(await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).toMatchObject({ status: "PENDING_PAYMENT", paymentStatus: "UNPAID" });
    expect(await markPaid(prisma, { providerOrderId: "order_unknown", providerPaymentId: "p", amountPaise: 1 })).toBe("unknown_payment");
  });

  it("expires unpaid orders, releases stock, and flags a late payment for refund instead of reviving the order", async () => {
    const v = await variant(2);
    const o = await place(v.id, 2);
    await expireUnpaidOrders(prisma, new Date(Date.now() - 60_000)); // nothing of ours is due yet (other tests may leave older orders)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe("PENDING_PAYMENT");
    expect(await bal(v.id)).toMatchObject({ reserved: 2 });
    expect(await expireUnpaidOrders(prisma, new Date(Date.now() + 3_600_000))).toBeGreaterThanOrEqual(1);
    expect(await bal(v.id)).toMatchObject({ onHand: 2, reserved: 0 });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).toMatchObject({ status: "CANCELLED" });

    const pa = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: o.orderId } });
    expect(await markPaid(prisma, { providerOrderId: pa.providerOrderId, providerPaymentId: "pay_late", amountPaise: pa.amountPaise })).toBe("late_payment_refund_due");
    expect(await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUND_DUE" });
    expect(await bal(v.id)).toMatchObject({ onHand: 2, reserved: 0 });
  });

  it("two shoppers racing for the last unit: exactly one order is placed and stock never goes negative", async () => {
    const v = await variant(1);
    const [c1, c2] = await Promise.all([createCart(prisma), createCart(prisma)]);
    await Promise.all([addToCart(prisma, c1.id, v.id, 1), addToCart(prisma, c2.id, v.id, 1)]);
    const results = await Promise.all([
      placeOrder(prisma, { cartId: c1.id, input: input({ paymentMethod: "COD" }), settings: settings({ codEnabled: true }), provider }),
      placeOrder(prisma, { cartId: c2.id, input: input({ paymentMethod: "COD" }), settings: settings({ codEnabled: true }), provider }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await bal(v.id)).toMatchObject({ onHand: 1, reserved: 1 });
    const loser = results.find((r) => !r.ok);
    expect(loser && !loser.ok && loser.message).toMatch(/sold out|no longer available|review/i);
  });

  it("a failed reservation rolls back the whole order (no order, no coupon use, cart kept)", async () => {
    const v = await variant(2);
    await prisma.coupon.create({ data: { code: `RB${run}`.toUpperCase(), type: "FIXED", value: 1000 } });
    const cartId = await cartWith(v.id, 2);
    await prisma.$executeRaw`UPDATE "InventoryBalance" SET "reserved" = 1 WHERE "variantId" = ${v.id}::uuid`; // someone else grabbed one after the cart check
    const r = await placeOrder(prisma, { cartId, input: input({ coupon: `RB${run}`.toUpperCase() }), settings: settings(), provider });
    expect(r.ok).toBe(false);
    expect(await prisma.order.count({ where: { items: { some: { variantId: v.id } } } })).toBe(0);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { code: `RB${run}`.toUpperCase() } })).usedCount).toBe(0);
    expect(await prisma.cartItem.count({ where: { cartId } })).toBe(1);
  });

  it("COD is refused unless enabled, respects the order limit, and adds the COD fee", async () => {
    const v = await variant(5, 100000, null);
    const cartId = await cartWith(v.id, 1);
    expect(await placeOrder(prisma, { cartId, input: input({ paymentMethod: "COD" }), settings: settings(), provider })).toMatchObject({ ok: false });
    expect(await placeOrder(prisma, { cartId, input: input({ paymentMethod: "COD" }), settings: settings({ codEnabled: true, codMaxOrderPaise: 50000 }), provider })).toMatchObject({ ok: false });
    const r = await placeOrder(prisma, { cartId, input: input({ paymentMethod: "COD" }), settings: settings({ codEnabled: true, codFeePaise: 5000, taxMode: "UNSET" }), provider });
    if (!r.ok) throw new Error(r.message);
    expect(r.needsPayment).toBe(false);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: r.orderId } })).toMatchObject({ status: "PLACED", codFeePaise: 5000, shippingPaise: 9900, totalPaise: 100000 + 9900 + 5000, taxPaise: 0 });
  });

  it("online payment is refused when no provider is configured", async () => {
    const v = await variant(2);
    const cartId = await cartWith(v.id, 1);
    expect(await placeOrder(prisma, { cartId, input: input(), settings: settings(), provider: null })).toMatchObject({ ok: false, message: expect.stringContaining("not available") });
  });

  it("the same idempotency key cannot create a second order", async () => {
    const v = await variant(5);
    const key = randomUUID();
    await place(v.id, 1, { idempotencyKey: key });
    const cartId = await cartWith(v.id, 1);
    expect(await placeOrder(prisma, { cartId, input: input({ idempotencyKey: key }), settings: settings(), provider })).toMatchObject({ ok: false });
    expect(await prisma.order.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it("coupons: applied once per order, limited by max uses, and released on cancel", async () => {
    const code = `C${run}`.toUpperCase();
    await prisma.coupon.create({ data: { code, type: "PERCENT", value: 1000, maxUses: 1 } });
    const v = await variant(5, 100000, null);
    const o = await place(v.id, 1, { coupon: code }, settings({ taxMode: "UNSET" }));
    expect(await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).toMatchObject({ discountPaise: 10000, couponCode: code });
    const cartId = await cartWith(v.id, 1);
    expect(await placeOrder(prisma, { cartId, input: input({ coupon: code }), settings: settings(), provider })).toMatchObject({ ok: false, message: expect.stringContaining("fully used") });
    await cancelOrder(prisma, { orderId: o.orderId, actorId, reason: "test" });
    expect((await prisma.coupon.findUniqueOrThrow({ where: { code } })).usedCount).toBe(0);
    expect(await placeOrder(prisma, { cartId, input: input({ coupon: code }), settings: settings(), provider })).toMatchObject({ ok: true });
  });

  it("cancelling a paid, undispatched order restocks the units and marks a refund due; shipped orders cannot be cancelled", async () => {
    const v = await variant(4);
    const o = await place(v.id, 2);
    const pa = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: o.orderId } });
    await markPaid(prisma, { providerOrderId: pa.providerOrderId, providerPaymentId: "pay_c", amountPaise: pa.amountPaise });
    expect(await bal(v.id)).toMatchObject({ onHand: 2 });
    expect(await cancelOrder(prisma, { orderId: o.orderId, actorId, reason: "Customer asked" })).toEqual({ ok: true });
    expect(await bal(v.id)).toMatchObject({ onHand: 4, reserved: 0 });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUND_DUE" });
    expect(await cancelOrder(prisma, { orderId: o.orderId, actorId, reason: "again" })).toMatchObject({ ok: false });
    expect(await markRefunded(prisma, o.orderId, "rfnd_123", { actorId })).toEqual({ ok: true });
    expect(await markRefunded(prisma, o.orderId, "rfnd_123", { actorId })).toMatchObject({ ok: false });

    const v2 = await variant(2);
    const o2 = await place(v2.id, 1, { paymentMethod: "COD" }, settings({ codEnabled: true }));
    expect(await markShipped(prisma, o2.orderId, { carrier: null, trackingNumber: null }, { actorId })).toMatchObject({ ok: false }); // not confirmed yet
    expect(await confirmOrder(prisma, o2.orderId, { actorId })).toEqual({ ok: true });
    expect(await markShipped(prisma, o2.orderId, { carrier: "Manual", trackingNumber: "AWB1" }, { actorId })).toEqual({ ok: true });
    expect(await bal(v2.id)).toMatchObject({ onHand: 1, reserved: 0 }); // COD stock leaves at dispatch
    expect(await cancelOrder(prisma, { orderId: o2.orderId, actorId, reason: "x" })).toMatchObject({ ok: false });
    expect(await markDelivered(prisma, o2.orderId, { actorId })).toEqual({ ok: true });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: o2.orderId } })).toMatchObject({ status: "DELIVERED", paymentStatus: "PAID" });
    expect(await markDelivered(prisma, o2.orderId, { actorId })).toMatchObject({ ok: false });
  });

  it("order items are immutable snapshots: later product edits do not change history", async () => {
    const v = await variant(3, 150000);
    const o = await place(v.id, 1);
    await prisma.product.update({ where: { id: v.productId }, data: { name: "Renamed", pricePaise: 999 } });
    await prisma.productVariant.update({ where: { id: v.id }, data: { size: "XXL" } });
    const item = (await prisma.order.findUniqueOrThrow({ where: { id: o.orderId }, include: { items: true } })).items[0];
    expect(item).toMatchObject({ unitPricePaise: 150000, size: "M" });
    expect(item?.name).toMatch(/^Order Test/);
  });

  it("guest confirmation access needs the token; the reference alone grants nothing", async () => {
    const v = await variant(3);
    const o = await place(v.id, 1);
    expect(await getOrderForToken(prisma, o.reference, o.accessToken)).not.toBeNull();
    expect(await getOrderForToken(prisma, o.reference, "wrong-token-value")).toBeNull();
    expect(await getOrderForToken(prisma, o.reference, undefined)).toBeNull();
    expect(await getOrderForToken(prisma, "TNV-NOPE0000", o.accessToken)).toBeNull();
  });

  it("invoices are blocked until business details exist, then numbered sequentially for paid orders only", async () => {
    const v = await variant(3);
    const o = await place(v.id, 1);
    expect(await assignInvoiceNumber(prisma, o.orderId, { actorId })).toMatchObject({ ok: false, message: expect.stringContaining("not set up") });
    const full = settings({ gstin: "27ABCDE1234F1Z5", legalName: "Tanvi Test Pvt Ltd", businessAddress: "Pune", businessStateCode: "27", invoicePrefix: "TNV" });
    await prisma.setting.upsert({ where: { key: "business" }, update: { data: full }, create: { key: "business", data: full } });
    expect(await assignInvoiceNumber(prisma, o.orderId, { actorId })).toMatchObject({ ok: false, message: expect.stringContaining("paid") });
    const pa = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: o.orderId } });
    await markPaid(prisma, { providerOrderId: pa.providerOrderId, providerPaymentId: "pay_i", amountPaise: pa.amountPaise });
    const a = await assignInvoiceNumber(prisma, o.orderId, { actorId });
    const again = await assignInvoiceNumber(prisma, o.orderId, { actorId });
    expect(a).toMatchObject({ ok: true, invoiceNumber: expect.stringMatching(/^TNV\/\d{4}\/\d{5}$/) });
    expect(again).toEqual(a); // idempotent
    await prisma.setting.delete({ where: { key: "business" } });
  });

  it("DB constraints reject impossible order money", async () => {
    const v = await variant(1);
    const o = await place(v.id, 1);
    await expect(prisma.order.update({ where: { id: o.orderId }, data: { discountPaise: 99_999_999 } })).rejects.toThrow();
    await expect(prisma.order.update({ where: { id: o.orderId }, data: { shipPincode: "12345" } })).rejects.toThrow();
  });
});
