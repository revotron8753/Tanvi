import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Razorpay adapter. Contract taken from Razorpay's official docs (verified 2026-10-29):
 *  - Create order: POST https://api.razorpay.com/v1/orders, HTTP Basic (key id : key secret), JSON body
 *    { amount (integer, smallest sub-unit), currency, receipt (<= 40 chars, unique), notes }, response { id, amount, currency, status, ... }
 *  - Checkout signature: HMAC-SHA256 hex of `${order_id}|${razorpay_payment_id}` keyed by the key secret,
 *    where order_id is OUR stored provider order id, compared with `razorpay_signature`.
 *  - Webhook: header `X-Razorpay-Signature` = HMAC-SHA256 hex of the RAW body keyed by the webhook secret;
 *    header `x-razorpay-event-id` is unique per event; events payment.captured / payment.failed carry
 *    payload.payment.entity { id, amount, currency, status, order_id, error_code, error_description }.
 * NOT yet verified against a real configured account: see docs/INTEGRATIONS.md.
 */
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class PaymentProviderError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

const orderResponse = z.object({ id: z.string().min(1), amount: z.number().int(), currency: z.string(), status: z.string() });

const webhookBody = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string(),
        amount: z.number().int(),
        currency: z.string(),
        status: z.string(),
        order_id: z.string().nullable(),
        error_code: z.string().nullable().optional(),
      }),
    }),
  }).partial(),
});
export type PaymentWebhook = z.infer<typeof webhookBody>;

const hmacHex = (secret: string, data: string | Buffer): string => createHmac("sha256", secret).update(data).digest("hex");

function equalHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createRazorpay(cfg: RazorpayConfig) {
  const f = cfg.fetchImpl ?? fetch;
  const base = cfg.baseUrl ?? "https://api.razorpay.com";
  return {
    name: "razorpay" as const,
    /** Public key id for Checkout (safe to send to the browser). The secret never leaves the server. */
    keyId: cfg.keyId,

    async createOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<{ providerOrderId: string }> {
      if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise < 100) throw new PaymentProviderError("Invalid amount", false);
      if (input.receipt.length > 40) throw new PaymentProviderError("Receipt too long", false);
      let res: Response;
      try {
        res = await f(`${base}/v1/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`,
          },
          body: JSON.stringify({ amount: input.amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes ?? {} }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new PaymentProviderError("Payment provider unreachable", true);
      }
      if (!res.ok) throw new PaymentProviderError(`Payment provider rejected the request (${res.status})`, res.status >= 500 || res.status === 429);
      const parsed = orderResponse.safeParse(await res.json().catch(() => null));
      if (!parsed.success || parsed.data.amount !== input.amountPaise || parsed.data.currency !== "INR") {
        throw new PaymentProviderError("Unexpected response from payment provider", false);
      }
      return { providerOrderId: parsed.data.id };
    },

    verifyCheckoutSignature(input: { providerOrderId: string; paymentId: string; signature: string }): boolean {
      return equalHex(hmacHex(cfg.keySecret, `${input.providerOrderId}|${input.paymentId}`), input.signature);
    },

    verifyWebhookSignature(rawBody: string | Buffer, signature: string | null): boolean {
      if (!cfg.webhookSecret || !signature) return false;
      return equalHex(hmacHex(cfg.webhookSecret, rawBody), signature);
    },

    parseWebhook(rawBody: string): PaymentWebhook | null {
      try {
        const parsed = webhookBody.safeParse(JSON.parse(rawBody));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
  };
}

export type PaymentProvider = ReturnType<typeof createRazorpay>;
