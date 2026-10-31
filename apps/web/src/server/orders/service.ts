import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@tanvi/database";
import { checkoutSchema, type CheckoutInput, type Settings } from "@tanvi/validation";
import { recordAudit } from "../catalog/audit";
import { adjustOnHand, commitReservedSale, releaseReservation, reserveStock } from "../catalog/inventory";
import { viewCart } from "../cart/service";
import { enqueueOrderEvent } from "../messaging/outbox";
import { PaymentProviderError, type PaymentProvider } from "../payments/razorpay";
import { computeTotals, evaluateCoupon } from "./pricing";
import { getSettings, invoiceBlockers } from "./settings";
import { canTransition, isCancellable } from "./state";

export class OrderError extends Error {}

const sha = (v: string): string => createHash("sha256").update(v).digest("hex");
const REF_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function newReference(): string {
  const bytes = randomBytes(8);
  return "TNV-" + Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
}

export type PlaceResult =
  | { ok: true; orderId: string; reference: string; accessToken: string; needsPayment: boolean; paymentStarted: boolean }
  | { ok: false; message: string };

type Tx = Prisma.TransactionClient;

/** Restocking sold units is always a staff decision, never a system one. */
function requireActor(id: string | null): string {
  if (!id) throw new Error("A staff actor is required to restock sold units");
  return id;
}

async function defaultLocation(db: PrismaClient | Tx) {
  const loc = await db.stockLocation.findFirst({ where: { isActive: true }, orderBy: { code: "asc" } });
  if (!loc) throw new OrderError("No stock location is configured.");
  return loc;
}

/**
 * Creates an order from a cart. The server recomputes every price, discount, tax, shipping and COD amount;
 * nothing numeric is taken from the browser. Stock is reserved in the same transaction as the order.
 */
export async function placeOrder(
  prisma: PrismaClient,
  args: { cartId: string; input: CheckoutInput; settings: Settings; provider: PaymentProvider | null; now?: Date; source?: "WEB" | "WHATSAPP" | "STORE"; staffId?: string },
): Promise<PlaceResult> {
  const { cartId, settings } = args;
  const input = checkoutSchema.parse(args.input);
  const now = args.now ?? new Date();

  const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { ok: false, message: "This order was already submitted. Check your confirmation page." };

  const cart = await viewCart(prisma, cartId);
  if (cart.lines.length === 0) return { ok: false, message: "Your bag is empty." };
  if (cart.hasProblems) return { ok: false, message: "Some items in your bag are no longer available in the quantity chosen. Please review your bag." };

  if (input.paymentMethod === "ONLINE" && !args.provider) return { ok: false, message: "Online payment is not available right now." };
  if (input.paymentMethod === "COD" && !settings.codEnabled) return { ok: false, message: "Cash on delivery is not available." };

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: cart.lines.map((l) => l.variantId) } },
    include: { product: { select: { gstRateBps: true, hsnCode: true } } },
  });
  const meta = new Map(variants.map((v) => [v.id, v.product]));

  let couponDiscount = 0;
  let couponCode: string | undefined;
  let couponId: string | undefined;
  if (input.coupon) {
    const c = await prisma.coupon.findUnique({ where: { code: input.coupon } });
    if (!c) return { ok: false, message: "That coupon code is not valid." };
    const check = evaluateCoupon(c, cart.subtotalPaise, now);
    if (!check.ok) return check;
    couponDiscount = check.discountPaise;
    couponCode = c.code;
    couponId = c.id;
  }

  const totals = computeTotals({
    lines: cart.lines.map((l) => ({ variantId: l.variantId, unitPricePaise: l.unitPricePaise, quantity: l.quantity, gstRateBps: meta.get(l.variantId)?.gstRateBps ?? null })),
    taxMode: settings.taxMode,
    couponDiscountPaise: couponDiscount,
    shipping: settings,
    cod: input.paymentMethod === "COD",
  });
  if (input.paymentMethod === "COD" && settings.codMaxOrderPaise !== null && totals.totalPaise > settings.codMaxOrderPaise) {
    return { ok: false, message: "Cash on delivery is not available for an order this size. Please pay online." };
  }

  const accessToken = randomBytes(24).toString("base64url");
  const reference = newReference();
  const online = input.paymentMethod === "ONLINE";

  try {
    const order = await prisma.$transaction(async (tx) => {
      const location = await defaultLocation(tx);
      const customer = await tx.customer.upsert({
        where: { email: input.email.toLowerCase() },
        update: { name: input.name, phone: input.phone },
        create: { email: input.email.toLowerCase(), name: input.name, phone: input.phone },
      });
      const created = await tx.order.create({
        data: {
          reference,
          status: online ? "PENDING_PAYMENT" : "PLACED",
          paymentStatus: "UNPAID",
          paymentMethod: input.paymentMethod,
          source: args.source ?? "WEB",
          customerId: customer.id,
          contactName: input.name,
          contactEmail: input.email.toLowerCase(),
          contactPhone: input.phone,
          shipLine1: input.line1,
          shipLine2: input.line2 ?? null,
          shipCity: input.city,
          shipState: input.state,
          shipPincode: input.pincode,
          subtotalPaise: totals.subtotalPaise,
          discountPaise: totals.discountPaise,
          shippingPaise: totals.shippingPaise,
          codFeePaise: totals.codFeePaise,
          taxPaise: totals.taxPaise,
          totalPaise: totals.totalPaise,
          taxMode: settings.taxMode,
          couponCode: couponCode ?? null,
          accessTokenHash: sha(accessToken),
          idempotencyKey: input.idempotencyKey,
          reservationExpiresAt: online ? new Date(now.getTime() + settings.reservationMinutes * 60_000) : null,
          placedByStaffId: args.staffId ?? null,
          items: {
            create: cart.lines.map((l) => {
              const priced = totals.lines.find((t) => t.variantId === l.variantId);
              return {
                variantId: l.variantId,
                locationId: location.id,
                name: l.name,
                sku: l.sku,
                size: l.size,
                colour: l.colour,
                hsnCode: meta.get(l.variantId)?.hsnCode ?? null,
                quantity: l.quantity,
                unitPricePaise: l.unitPricePaise,
                discountPaise: priced?.discountPaise ?? 0,
                gstRateBps: meta.get(l.variantId)?.gstRateBps ?? null,
                taxPaise: priced?.taxPaise ?? 0,
              };
            }),
          },
        },
      });
      for (const l of cart.lines) {
        const r = await reserveStock(tx, { variantId: l.variantId, locationId: location.id, quantity: l.quantity, reference });
        if (!r.ok) throw new OrderError(`Sorry, ${l.name} (${l.size}) just sold out. Please review your bag.`);
      }
      if (couponId) {
        const n = await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE "id" = ${couponId}::uuid AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`;
        if (n === 0) throw new OrderError("That coupon has just been fully used.");
      }
      await tx.cartItem.deleteMany({ where: { cartId } });
      return created;
    });

    if (!online) await enqueueOrderEvent(prisma, order.id, "order.received");
    let paymentStarted = false;
    if (online && args.provider) {
      const started = await startPayment(prisma, args.provider, order.id);
      if (!started.ok) {
        await cancelOrder(prisma, { orderId: order.id, actorId: null, reason: "Payment could not be started" });
        return { ok: false, message: "We couldn't start the payment. Your bag is unchanged on our side; please try again in a moment." };
      }
      paymentStarted = true;
    }
    return { ok: true, orderId: order.id, reference, accessToken, needsPayment: online, paymentStarted };
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, message: e.message };
    throw e;
  }
}

/** Creates a fresh provider order for this order (the provider requires a new one per attempt). */
export async function startPayment(prisma: PrismaClient, provider: PaymentProvider, orderId: string): Promise<{ ok: true; providerOrderId: string; amountPaise: number } | { ok: false; message: string }> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "PENDING_PAYMENT" || order.paymentMethod !== "ONLINE") return { ok: false, message: "This order is not awaiting payment." };
  if (order.reservationExpiresAt && order.reservationExpiresAt <= new Date()) return { ok: false, message: "This order has expired." };
  try {
    const { providerOrderId } = await provider.createOrder({ amountPaise: order.totalPaise, receipt: order.reference, notes: { orderReference: order.reference } });
    await prisma.paymentAttempt.create({ data: { orderId, provider: provider.name, providerOrderId, amountPaise: order.totalPaise } });
    return { ok: true, providerOrderId, amountPaise: order.totalPaise };
  } catch (e) {
    if (e instanceof PaymentProviderError) return { ok: false, message: "Payment provider unavailable." };
    throw e;
  }
}

export type PaidOutcome = "confirmed" | "already_paid" | "amount_mismatch" | "unknown_payment" | "late_payment_refund_due";

/**
 * Idempotent: safe for repeated checkout callbacks and repeated webhooks. Stock is committed at most once
 * because each item's stockState moves RESERVED → COMMITTED exactly once, under a row lock on the order.
 */
export async function markPaid(prisma: PrismaClient, args: { providerOrderId: string; providerPaymentId: string; amountPaise: number }): Promise<PaidOutcome> {
  const outcome = await markPaidTx(prisma, args);
  if (outcome === "confirmed") {
    const a = await prisma.paymentAttempt.findUnique({ where: { providerOrderId: args.providerOrderId }, select: { orderId: true } });
    if (a) await enqueueOrderEvent(prisma, a.orderId, "order.payment_confirmed");
  }
  return outcome;
}

async function markPaidTx(prisma: PrismaClient, args: { providerOrderId: string; providerPaymentId: string; amountPaise: number }): Promise<PaidOutcome> {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUnique({ where: { providerOrderId: args.providerOrderId } });
    if (!attempt) return "unknown_payment";
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${attempt.orderId}::uuid FOR UPDATE`;
    const fresh = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    const order = await tx.order.findUniqueOrThrow({ where: { id: attempt.orderId }, include: { items: true } });
    if (fresh.status === "PAID") return "already_paid";
    if (args.amountPaise !== fresh.amountPaise || fresh.amountPaise !== order.totalPaise) {
      await recordAudit(tx, { actorId: null, action: "payment.amount_mismatch", entityType: "Order", entityId: order.id });
      return "amount_mismatch";
    }
    await tx.paymentAttempt.update({ where: { id: fresh.id }, data: { status: "PAID", providerPaymentId: args.providerPaymentId } });
    if (order.status === "CANCELLED") {
      // Payment arrived after we released the stock. Do not silently revive the order; flag it for a refund.
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUND_DUE", staffNote: "Paid after the order was cancelled/expired. Refund due." } });
      return "late_payment_refund_due";
    }
    for (const item of order.items.filter((i) => i.stockState === "RESERVED")) {
      const r = await commitReservedSale(tx, { variantId: item.variantId, locationId: item.locationId, quantity: item.quantity, reference: order.reference });
      if (!r.ok) throw new Error("Stock reservation missing for a paid order");
      await tx.orderItem.update({ where: { id: item.id }, data: { stockState: "COMMITTED" } });
    }
    await tx.order.update({ where: { id: order.id }, data: { status: "CONFIRMED", paymentStatus: "PAID", reservationExpiresAt: null } });
    return "confirmed";
  });
}

export async function markPaymentFailed(prisma: PrismaClient, args: { providerOrderId: string; failureCode: string | null }): Promise<void> {
  await prisma.paymentAttempt.updateMany({ where: { providerOrderId: args.providerOrderId, status: "CREATED" }, data: { status: "FAILED", failureCode: args.failureCode?.slice(0, 80) ?? null } });
}

/** Cancels an order and puts stock back: reserved units are released; already-sold units are restocked (before dispatch only). */
export async function cancelOrder(prisma: PrismaClient, args: { orderId: string; actorId: string | null; reason: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await cancelOrderTx(prisma, args);
  if (res.ok) await enqueueOrderEvent(prisma, args.orderId, "order.cancelled");
  return res;
}

async function cancelOrderTx(prisma: PrismaClient, args: { orderId: string; actorId: string | null; reason: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${args.orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: args.orderId }, include: { items: true } });
    if (!order) return { ok: false, message: "Order not found." } as const;
    if (!isCancellable(order.status)) return { ok: false, message: "This order can no longer be cancelled." } as const;
    for (const item of order.items) {
      if (item.stockState === "RESERVED") {
        await releaseReservation(tx, { variantId: item.variantId, locationId: item.locationId, quantity: item.quantity, reference: order.reference, reason: args.reason });
        await tx.orderItem.update({ where: { id: item.id }, data: { stockState: "RELEASED" } });
      } else if (item.stockState === "COMMITTED") {
        await adjustOnHand(tx, { variantId: item.variantId, locationId: item.locationId, delta: item.quantity, reason: `Order ${order.reference} cancelled before dispatch`, actorId: requireActor(args.actorId), type: "ADJUSTMENT" });
        await tx.orderItem.update({ where: { id: item.id }, data: { stockState: "RESTOCKED" } });
      }
    }
    if (order.couponCode) await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE "code" = ${order.couponCode}`;
    await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelReason: args.reason.slice(0, 300), reservationExpiresAt: null, paymentStatus: order.paymentStatus === "PAID" ? "REFUND_DUE" : order.paymentStatus },
    });
    if (args.actorId) await recordAudit(tx, { actorId: args.actorId, action: "order.cancelled", entityType: "Order", entityId: order.id, metadata: { reason: args.reason.slice(0, 100) } });
    return { ok: true } as const;
  });
}

/** Cancels unpaid online orders whose reservation window has passed and releases their stock. */
export async function expireUnpaidOrders(prisma: PrismaClient, now = new Date()): Promise<number> {
  const due = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", reservationExpiresAt: { lte: now } },
    select: { id: true },
    take: 200,
  });
  let n = 0;
  for (const o of due) {
    const r = await cancelOrder(prisma, { orderId: o.id, actorId: null, reason: "Payment not completed in time" });
    if (r.ok) n++;
  }
  return n;
}

type Staff = { actorId: string };

export async function confirmOrder(prisma: PrismaClient, orderId: string, staff: Staff): Promise<{ ok: true } | { ok: false; message: string }> {
  const o = await prisma.order.findUnique({ where: { id: orderId } });
  if (!o) return { ok: false, message: "Order not found." };
  if (!canTransition(o.status, "CONFIRMED") || o.status !== "PLACED") return { ok: false, message: "Only placed (COD) orders need manual confirmation." };
  await prisma.order.update({ where: { id: orderId }, data: { status: "CONFIRMED" } });
  await recordAudit(prisma, { actorId: staff.actorId, action: "order.confirmed", entityType: "Order", entityId: orderId });
  await enqueueOrderEvent(prisma, orderId, "order.confirmed");
  return { ok: true };
}

export async function markShipped(prisma: PrismaClient, orderId: string, shipment: { carrier: string | null; trackingNumber: string | null }, staff: Staff): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await markShippedTx(prisma, orderId, shipment, staff);
  if (res.ok) await enqueueOrderEvent(prisma, orderId, "order.shipped");
  return res;
}

async function markShippedTx(prisma: PrismaClient, orderId: string, shipment: { carrier: string | null; trackingNumber: string | null }, staff: Staff): Promise<{ ok: true } | { ok: false; message: string }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
    const o = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!o) return { ok: false, message: "Order not found." } as const;
    if (!canTransition(o.status, "SHIPPED")) return { ok: false, message: "Only confirmed orders can be shipped." } as const;
    for (const item of o.items.filter((i) => i.stockState === "RESERVED")) {
      const r = await commitReservedSale(tx, { variantId: item.variantId, locationId: item.locationId, quantity: item.quantity, reference: o.reference });
      if (!r.ok) throw new Error("Stock reservation missing at dispatch");
      await tx.orderItem.update({ where: { id: item.id }, data: { stockState: "COMMITTED" } });
    }
    await tx.shipment.create({ data: { orderId, carrier: shipment.carrier?.slice(0, 80) ?? null, trackingNumber: shipment.trackingNumber?.slice(0, 80) ?? null } });
    await tx.order.update({ where: { id: orderId }, data: { status: "SHIPPED" } });
    await recordAudit(tx, { actorId: staff.actorId, action: "order.shipped", entityType: "Order", entityId: orderId });
    return { ok: true } as const;
  });
}

export async function markDelivered(prisma: PrismaClient, orderId: string, staff: Staff): Promise<{ ok: true } | { ok: false; message: string }> {
  const o = await prisma.order.findUnique({ where: { id: orderId } });
  if (!o) return { ok: false, message: "Order not found." };
  if (!canTransition(o.status, "DELIVERED")) return { ok: false, message: "Only shipped orders can be marked delivered." };
  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { status: "DELIVERED", ...(o.paymentMethod === "COD" ? { paymentStatus: "PAID" as const } : {}) } }),
    prisma.shipment.updateMany({ where: { orderId }, data: { deliveredAt: new Date() } }),
  ]);
  await recordAudit(prisma, { actorId: staff.actorId, action: "order.delivered", entityType: "Order", entityId: orderId, metadata: { codCollected: o.paymentMethod === "COD" } });
  await enqueueOrderEvent(prisma, orderId, "order.delivered");
  return { ok: true };
}

export async function markRefunded(prisma: PrismaClient, orderId: string, note: string, staff: Staff): Promise<{ ok: true } | { ok: false; message: string }> {
  if (note.trim().length < 3) return { ok: false, message: "Enter the refund reference (for example the Razorpay refund id)." };
  const n = await prisma.order.updateMany({ where: { id: orderId, paymentStatus: "REFUND_DUE" }, data: { paymentStatus: "REFUNDED", staffNote: note.trim().slice(0, 300) } });
  if (n.count === 0) return { ok: false, message: "No refund is due on this order." };
  await recordAudit(prisma, { actorId: staff.actorId, action: "order.refund_recorded", entityType: "Order", entityId: orderId });
  await enqueueOrderEvent(prisma, orderId, "order.refunded");
  return { ok: true };
}

/** Access check for the guest confirmation page. The reference alone never grants access. */
export async function getOrderForToken(prisma: PrismaClient, reference: string, token: string | undefined) {
  if (!token) return null;
  const order = await prisma.order.findUnique({ where: { reference }, include: { items: true, shipment: true, payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!order) return null;
  const a = Buffer.from(sha(token));
  const b = Buffer.from(order.accessTokenHash);
  return a.length === b.length && timingSafeEqual(a, b) ? order : null;
}

/** Assigns the next invoice number if (and only if) the business details required for a GST invoice exist. */
export async function assignInvoiceNumber(prisma: PrismaClient, orderId: string, staff: Staff): Promise<{ ok: true; invoiceNumber: string } | { ok: false; message: string }> {
  const settings = await getSettings(prisma);
  const blockers = invoiceBlockers(settings);
  if (blockers.length) return { ok: false, message: `Invoices are not set up yet. ${blockers.join(" ")}` };
  return prisma.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: orderId } });
    if (!o) return { ok: false, message: "Order not found." } as const;
    if (o.invoiceNumber) return { ok: true, invoiceNumber: o.invoiceNumber } as const;
    if (o.paymentStatus !== "PAID") return { ok: false, message: "An invoice is issued only for paid orders." } as const;
    const year = new Date().getFullYear();
    const rows = await tx.$queryRaw<{ last: number }[]>`INSERT INTO "InvoiceCounter" ("year","last") VALUES (${year}, 1)
      ON CONFLICT ("year") DO UPDATE SET "last" = "InvoiceCounter"."last" + 1 RETURNING "last"`;
    const seq = rows[0]?.last ?? 1;
    const invoiceNumber = `${settings.invoicePrefix}/${year}/${String(seq).padStart(5, "0")}`;
    await tx.order.update({ where: { id: orderId }, data: { invoiceNumber, invoicedAt: new Date() } });
    await recordAudit(tx, { actorId: staff.actorId, action: "order.invoice_issued", entityType: "Order", entityId: orderId, metadata: { invoiceNumber } });
    return { ok: true, invoiceNumber } as const;
  });
}
