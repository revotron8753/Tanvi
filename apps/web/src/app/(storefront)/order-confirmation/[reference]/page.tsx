import { getPrisma } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderForToken } from "@/server/orders/service";
import { STATUS_LABEL } from "@/server/orders/state";

export const metadata: Metadata = { title: "Order", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ConfirmationPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ t?: string }> }) {
  const { reference } = await params;
  const token = (await searchParams).t;
  // The reference alone never grants access: a missing/incorrect token is indistinguishable from "no such order".
  const order = await getOrderForToken(getPrisma(), reference, token);
  if (!order) notFound();
  const money = (n: number) => formatPaise(paise(n));
  const heading =
    order.status === "CANCELLED" ? "This order was cancelled"
    : order.status === "PENDING_PAYMENT" ? "We're waiting for your payment"
    : order.paymentMethod === "COD" && order.status === "PLACED" ? "Thank you. We've received your order"
    : "Thank you. Your order is confirmed";
  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <header className="text-center">
        <h1 className="text-4xl">{heading}</h1>
        <p className="mt-2 text-cocoa">Order {order.reference} · {STATUS_LABEL[order.status]}</p>
        {order.paymentMethod === "COD" && order.status === "PLACED" ? <p className="mt-2 text-sm">We&apos;ll confirm your order shortly. You pay on delivery.</p> : null}
        {order.status === "PENDING_PAYMENT" ? <p className="mt-2 text-sm"><Link className="underline" href={`/checkout/pay/${order.reference}?t=${token}`}>Complete payment</Link></p> : null}
        {order.paymentStatus === "REFUND_DUE" ? <p className="mt-2 text-sm text-cocoa">A refund is due for this order and will be processed by our team.</p> : null}
      </header>
      <p className="text-xs text-cocoa">Keep this page&apos;s link private. It&apos;s the only way to view this order without an account.</p>
      <ul className="divide-y divide-beige border-y border-beige">
        {order.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-4 py-3 text-sm">
            <span>{i.name} · {i.size}/{i.colour} × {i.quantity}</span>
            <span>{money(i.unitPricePaise * i.quantity)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(order.subtotalPaise)}</dd></div>
        {order.discountPaise > 0 ? <div className="flex justify-between"><dt>Discount</dt><dd>−{money(order.discountPaise)}</dd></div> : null}
        <div className="flex justify-between"><dt>Shipping</dt><dd>{order.shippingPaise === 0 ? "Free" : money(order.shippingPaise)}</dd></div>
        {order.codFeePaise > 0 ? <div className="flex justify-between"><dt>COD fee</dt><dd>{money(order.codFeePaise)}</dd></div> : null}
        <div className="flex justify-between border-t border-beige pt-2 text-base font-medium"><dt>Total</dt><dd>{money(order.totalPaise)}</dd></div>
      </dl>
      <section aria-labelledby="ship-h" className="text-sm">
        <h2 id="ship-h" className="text-xl">Delivering to</h2>
        <address className="mt-1 not-italic">
          {order.contactName}<br />{order.shipLine1}{order.shipLine2 ? `, ${order.shipLine2}` : ""}<br />{order.shipCity}, {order.shipState} {order.shipPincode}
        </address>
        {order.shipment?.trackingNumber ? <p className="mt-2">Tracking: {order.shipment.carrier ? `${order.shipment.carrier} ` : ""}{order.shipment.trackingNumber}</p> : null}
      </section>
      <p className="text-center"><Link href="/shop" className="underline">Continue shopping</Link></p>
    </article>
  );
}
