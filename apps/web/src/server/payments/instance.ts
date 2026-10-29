import "server-only";
import { env } from "../env";
import { createRazorpay, type PaymentProvider } from "./razorpay";

let provider: PaymentProvider | null | undefined;

/** null when Razorpay credentials are not configured: online payment is then unavailable, never faked. */
export function getPaymentProvider(): PaymentProvider | null {
  if (provider !== undefined) return provider;
  const e = env();
  provider = e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET
    ? createRazorpay({ keyId: e.RAZORPAY_KEY_ID, keySecret: e.RAZORPAY_KEY_SECRET, webhookSecret: e.RAZORPAY_WEBHOOK_SECRET ?? null, ...(e.RAZORPAY_API_BASE_URL ? { baseUrl: e.RAZORPAY_API_BASE_URL } : {}) })
    : null;
  return provider;
}
