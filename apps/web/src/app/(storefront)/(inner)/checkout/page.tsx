import { getPrisma } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/features/checkout/checkout-form";
import { computeTotals, evaluateCoupon } from "@/server/orders/pricing";
import { getSettings } from "@/server/orders/settings";
import { getPaymentProvider } from "@/server/payments/instance";
import { peekCartView } from "@/server/shopper";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ coupon?: string }> }) {
  const prisma = getPrisma();
  const cart = await peekCartView();
  if (!cart || cart.lines.length === 0) redirect("/cart");
  if (cart.hasProblems) redirect("/cart");
  const settings = await getSettings(prisma);
  const onlineAvailable = getPaymentProvider() !== null;
  const codAvailable = settings.codEnabled;

  const couponCode = (await searchParams).coupon?.trim().toUpperCase().slice(0, 40) || undefined;
  let couponDiscount = 0;
  let couponMessage: { ok: boolean; text: string } | null = null;
  if (couponCode) {
    const c = await prisma.coupon.findUnique({ where: { code: couponCode } });
    const check = c ? evaluateCoupon(c, cart.subtotalPaise, new Date()) : ({ ok: false, message: "That coupon code is not valid." } as const);
    if (check.ok) {
      couponDiscount = check.discountPaise;
      couponMessage = { ok: true, text: `Coupon ${couponCode} applied.` };
    } else couponMessage = { ok: false, text: check.message };
  }
  const variants = await prisma.productVariant.findMany({ where: { id: { in: cart.lines.map((l) => l.variantId) } }, include: { product: { select: { gstRateBps: true } } } });
  const totals = computeTotals({
    lines: cart.lines.map((l) => ({ variantId: l.variantId, unitPricePaise: l.unitPricePaise, quantity: l.quantity, gstRateBps: variants.find((v) => v.id === l.variantId)?.product.gstRateBps ?? null })),
    taxMode: settings.taxMode,
    couponDiscountPaise: couponDiscount,
    shipping: settings,
    cod: false,
  });
  const money = (n: number) => formatPaise(paise(n));

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_24rem]">
      <section aria-labelledby="co-h">
        <h1 id="co-h" className="mb-6 text-4xl">Checkout</h1>
        <CheckoutForm
          idempotencyKey={randomUUID()}
          onlineAvailable={onlineAvailable}
          codAvailable={codAvailable}
          coupon={couponMessage?.ok ? couponCode : undefined}
          codFeeText={settings.codFeePaise > 0 ? `+ ${money(settings.codFeePaise)} fee` : null}
        />
      </section>
      <aside className="h-fit space-y-4 border border-beige bg-white p-6" aria-labelledby="os-h">
        <h2 id="os-h" className="text-2xl">Order summary</h2>
        <ul className="space-y-2 text-sm">
          {cart.lines.map((l) => (
            <li key={l.variantId} className="flex justify-between gap-3">
              <span>{l.name} · {l.size}/{l.colour} × {l.quantity}</span>
              <span>{money(l.linePricePaise)}</span>
            </li>
          ))}
        </ul>
        <form action="/checkout" className="flex gap-2" role="search" aria-label="Coupon">
          <label htmlFor="coupon" className="sr-only">Coupon code</label>
          <input id="coupon" name="coupon" defaultValue={couponCode} placeholder="Coupon code" className="min-h-10 w-full rounded-sm border border-taupe px-2 uppercase" />
          <button className="min-h-10 border border-espresso px-3 text-sm hover:bg-beige">Apply</button>
        </form>
        {couponMessage ? <p role="status" className={`text-sm ${couponMessage.ok ? "text-success" : "text-danger"}`}>{couponMessage.text}</p> : null}
        <dl className="space-y-1 border-t border-beige pt-3 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(totals.subtotalPaise)}</dd></div>
          {totals.discountPaise > 0 ? <div className="flex justify-between text-success"><dt>Discount</dt><dd>−{money(totals.discountPaise)}</dd></div> : null}
          <div className="flex justify-between"><dt>Shipping</dt><dd>{totals.shippingPaise === 0 ? "Free" : money(totals.shippingPaise)}</dd></div>
          {settings.taxMode !== "UNSET" && totals.taxPaise > 0 ? (
            <div className="flex justify-between text-cocoa"><dt>{settings.taxMode === "INCLUSIVE" ? "GST included" : "GST"}</dt><dd>{money(totals.taxPaise)}</dd></div>
          ) : null}
          <div className="flex justify-between border-t border-beige pt-2 text-base font-medium"><dt>Total</dt><dd>{money(totals.totalPaise)}</dd></div>
        </dl>
        <p className="text-xs text-cocoa">The final amount is calculated again on our server when you place the order.</p>
        <Link href="/cart" className="block text-sm underline">Edit bag</Link>
      </aside>
    </div>
  );
}
