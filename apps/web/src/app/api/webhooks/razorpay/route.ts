import { getPrisma } from "@tanvi/database";
import { markPaid, markPaymentFailed } from "@/server/orders/service";
import { getPaymentProvider } from "@/server/payments/instance";

export const dynamic = "force-dynamic";

/**
 * Razorpay webhook. Authenticity: HMAC-SHA256 of the RAW body vs X-Razorpay-Signature (verifyWebhookSignature).
 * Idempotency: x-razorpay-event-id is unique per event; duplicates are acknowledged without reprocessing.
 */
export async function POST(req: Request): Promise<Response> {
  const provider = getPaymentProvider();
  if (!provider) return new Response("Not configured", { status: 404 });
  const raw = await req.text(); // must be the exact bytes Razorpay signed
  if (!provider.verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) return new Response("Invalid signature", { status: 400 });
  const eventId = req.headers.get("x-razorpay-event-id");
  const body = provider.parseWebhook(raw);
  if (!eventId || !body) return new Response("Bad request", { status: 400 });

  const prisma = getPrisma();
  const existing = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider: provider.name, eventId } } });
  if (existing?.processedAt) return Response.json({ status: "duplicate" });
  const row = existing ?? (await prisma.webhookEvent.create({ data: { provider: provider.name, eventId, type: body.event.slice(0, 80) } }));

  let outcome = "ignored";
  const payment = body.payload.payment?.entity;
  if (payment?.order_id) {
    if (body.event === "payment.captured") {
      outcome = await markPaid(prisma, { providerOrderId: payment.order_id, providerPaymentId: payment.id, amountPaise: payment.amount });
    } else if (body.event === "payment.failed") {
      await markPaymentFailed(prisma, { providerOrderId: payment.order_id, failureCode: payment.error_code ?? null });
      outcome = "failure_recorded";
    }
  }
  await prisma.webhookEvent.update({ where: { id: row.id }, data: { processedAt: new Date(), outcome } });
  return Response.json({ status: "ok" });
}
