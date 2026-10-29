"use server";

import { getPrisma } from "@tanvi/database";
import { checkoutSchema } from "@tanvi/validation";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { getOrderForToken, expireUnpaidOrders, markPaid, markPaymentFailed, placeOrder, startPayment } from "@/server/orders/service";
import { getSettings } from "@/server/orders/settings";
import { getPaymentProvider } from "@/server/payments/instance";
import { peekCartId } from "@/server/shopper";

export async function placeOrderAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue ? `${String(issue.path[0] ?? "Details")}: ${issue.message}` : "Please check your details." };
  }
  const prisma = getPrisma();
  const cartId = await peekCartId();
  if (!cartId) return { error: "Your bag is empty." };
  await expireUnpaidOrders(prisma); // opportunistic: frees stock held by abandoned checkouts
  const res = await placeOrder(prisma, { cartId, input: parsed.data, settings: await getSettings(prisma), provider: getPaymentProvider() });
  if (!res.ok) return { error: res.message };
  redirect(res.needsPayment ? `/checkout/pay/${res.reference}?t=${res.accessToken}` : `/order-confirmation/${res.reference}?t=${res.accessToken}`);
}

const verifySchema = z.object({
  reference: z.string().min(4).max(20),
  token: z.string().min(10).max(100),
  paymentId: z.string().min(1).max(100),
  signature: z.string().min(1).max(200),
});

/**
 * Called from Checkout's success handler. The provider order id is read from OUR database, never from the browser,
 * and the signature must verify against it (SPEC §11).
 */
export async function verifyPaymentAction(input: z.infer<typeof verifySchema>): Promise<{ ok: boolean; message?: string }> {
  const parsed = verifySchema.safeParse(input);
  const provider = getPaymentProvider();
  if (!parsed.success || !provider) return { ok: false, message: "We couldn't verify this payment." };
  const prisma = getPrisma();
  const order = await getOrderForToken(prisma, parsed.data.reference, parsed.data.token);
  if (!order) return { ok: false, message: "We couldn't verify this payment." };
  const attempt = order.payments[0];
  if (!attempt) return { ok: false, message: "We couldn't verify this payment." };
  if (!provider.verifyCheckoutSignature({ providerOrderId: attempt.providerOrderId, paymentId: parsed.data.paymentId, signature: parsed.data.signature })) {
    return { ok: false, message: "We couldn't verify this payment. If money was deducted it will be reviewed; please contact us with your order reference." };
  }
  const outcome = await markPaid(prisma, { providerOrderId: attempt.providerOrderId, providerPaymentId: parsed.data.paymentId, amountPaise: attempt.amountPaise });
  return outcome === "confirmed" || outcome === "already_paid" ? { ok: true } : { ok: false, message: "Your payment is being reviewed. Please contact us with your order reference." };
}

export async function paymentFailedAction(input: { reference: string; token: string; code: string | null }): Promise<void> {
  const prisma = getPrisma();
  const order = await getOrderForToken(prisma, String(input.reference).slice(0, 20), String(input.token).slice(0, 100));
  const attempt = order?.payments[0];
  if (attempt) await markPaymentFailed(prisma, { providerOrderId: attempt.providerOrderId, failureCode: input.code });
}

export async function retryPaymentAction(reference: string, token: string): Promise<void> {
  const prisma = getPrisma();
  const provider = getPaymentProvider();
  const order = await getOrderForToken(prisma, reference.slice(0, 20), token.slice(0, 100));
  if (order && provider && order.status === "PENDING_PAYMENT") await startPayment(prisma, provider, order.id);
  redirect(`/checkout/pay/${reference}?t=${token}`);
}
