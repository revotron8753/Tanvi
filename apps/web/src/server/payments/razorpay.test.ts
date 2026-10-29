import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createRazorpay, PaymentProviderError } from "./razorpay";

const hmac = (k: string, d: string) => createHmac("sha256", k).update(d).digest("hex");
const mk = (fetchImpl?: typeof fetch) => createRazorpay({ keyId: "rzp_test_key", keySecret: "sekret", webhookSecret: "whsec", ...(fetchImpl ? { fetchImpl } : {}) });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("razorpay adapter", () => {
  it("creates an order with Basic auth, integer paise and INR", async () => {
    const f = vi.fn(async () => json({ id: "order_123", amount: 249900, currency: "INR", status: "created" }));
    const out = await mk(f as unknown as typeof fetch).createOrder({ amountPaise: 249900, receipt: "TNV-ABC" });
    expect(out).toEqual({ providerOrderId: "order_123" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("rzp_test_key:sekret").toString("base64")}`);
    expect(JSON.parse(init.body as string)).toMatchObject({ amount: 249900, currency: "INR", receipt: "TNV-ABC" });
  });

  it("rejects amount mismatches, bad shapes, HTTP errors and network failures without leaking provider detail", async () => {
    await expect(mk((async () => json({ id: "o", amount: 1, currency: "INR", status: "created" })) as unknown as typeof fetch).createOrder({ amountPaise: 249900, receipt: "r" })).rejects.toThrow(PaymentProviderError);
    await expect(mk((async () => json({ nope: true })) as unknown as typeof fetch).createOrder({ amountPaise: 249900, receipt: "r" })).rejects.toThrow("Unexpected response");
    const err = await mk((async () => json({ error: { description: "secret internal detail" } }, 401)) as unknown as typeof fetch).createOrder({ amountPaise: 249900, receipt: "r" }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(PaymentProviderError);
    expect((err as Error).message).not.toContain("secret internal detail");
    expect((err as PaymentProviderError).retryable).toBe(false);
    const down = await mk((async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch).createOrder({ amountPaise: 249900, receipt: "r" }).catch((e: unknown) => e);
    expect((down as PaymentProviderError).retryable).toBe(true);
    await expect(mk().createOrder({ amountPaise: 99.5, receipt: "r" })).rejects.toThrow("Invalid amount");
    await expect(mk().createOrder({ amountPaise: 5000, receipt: "x".repeat(41) })).rejects.toThrow("Receipt too long");
  });

  it("verifies checkout signatures per the documented algorithm", () => {
    const p = mk();
    const sig = hmac("sekret", "order_123|pay_456");
    expect(p.verifyCheckoutSignature({ providerOrderId: "order_123", paymentId: "pay_456", signature: sig })).toBe(true);
    expect(p.verifyCheckoutSignature({ providerOrderId: "order_999", paymentId: "pay_456", signature: sig })).toBe(false);
    expect(p.verifyCheckoutSignature({ providerOrderId: "order_123", paymentId: "pay_457", signature: sig })).toBe(false);
    expect(p.verifyCheckoutSignature({ providerOrderId: "order_123", paymentId: "pay_456", signature: "" })).toBe(false);
  });

  it("verifies webhook signatures over the exact raw body", () => {
    const p = mk();
    const raw = '{"event":"payment.captured"}';
    expect(p.verifyWebhookSignature(raw, hmac("whsec", raw))).toBe(true);
    expect(p.verifyWebhookSignature(raw + " ", hmac("whsec", raw))).toBe(false);
    expect(p.verifyWebhookSignature(raw, null)).toBe(false);
    expect(createRazorpay({ keyId: "k", keySecret: "s", webhookSecret: null }).verifyWebhookSignature(raw, hmac("x", raw))).toBe(false);
  });

  it("parses documented webhook payloads and rejects junk", () => {
    const p = mk();
    const body = JSON.stringify({ entity: "event", event: "payment.captured", payload: { payment: { entity: { id: "pay_1", amount: 100, currency: "INR", status: "captured", order_id: "order_1", error_code: null } } } });
    expect(p.parseWebhook(body)?.payload.payment?.entity.order_id).toBe("order_1");
    expect(p.parseWebhook("not json")).toBeNull();
    expect(p.parseWebhook("{}")).toBeNull();
  });
});
