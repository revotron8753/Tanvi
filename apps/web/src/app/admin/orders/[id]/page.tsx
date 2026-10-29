import { getPrisma } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { Field } from "@/components/ui/field";
import { orderStepAction } from "@/features/orders/actions";
import { requireAdmin } from "@/server/auth/guard";
import { STATUS_LABEL } from "@/server/orders/state";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("orders.read");
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const o = await getPrisma().order.findUnique({ where: { id: id.data }, include: { items: true, shipment: true, payments: { orderBy: { createdAt: "desc" } } } });
  if (!o) notFound();
  const canWrite = auth.permissions.has("orders.write");
  const money = (n: number) => formatPaise(paise(n));
  const step = (s: Parameters<typeof orderStepAction>[1]) => orderStepAction.bind(null, o.id, s);
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Order {o.reference}</h1>
      <p className="mt-1 text-sm text-cocoa">{STATUS_LABEL[o.status]} · {o.paymentMethod === "COD" ? "Cash on delivery" : "Online payment"} · {o.paymentStatus.replace("_", " ").toLowerCase()} · source {o.source.toLowerCase()}</p>
      {o.paymentStatus === "REFUND_DUE" ? <p role="status" className="mt-3 rounded-sm border border-danger p-3 text-sm text-danger">Refund due. Refund the customer in the payment provider&apos;s dashboard, then record it below. {o.staffNote}</p> : null}
      {o.cancelReason ? <p className="mt-2 text-sm">Cancelled: {o.cancelReason}</p> : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="items-h">
          <h2 id="items-h" className="text-2xl">Items</h2>
          <ul className="mt-2 divide-y divide-beige border-y border-beige text-sm">
            {o.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2">
                <span>{i.name} · {i.size}/{i.colour} · <span className="font-mono text-xs">{i.sku}</span> × {i.quantity} <span className="text-cocoa">({i.stockState.toLowerCase()})</span></span>
                <span>{money(i.unitPricePaise * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(o.subtotalPaise)}</dd></div>
            {o.discountPaise > 0 ? <div className="flex justify-between"><dt>Discount {o.couponCode ? `(${o.couponCode})` : ""}</dt><dd>−{money(o.discountPaise)}</dd></div> : null}
            <div className="flex justify-between"><dt>Shipping</dt><dd>{money(o.shippingPaise)}</dd></div>
            {o.codFeePaise > 0 ? <div className="flex justify-between"><dt>COD fee</dt><dd>{money(o.codFeePaise)}</dd></div> : null}
            <div className="flex justify-between text-cocoa"><dt>Tax ({o.taxMode.toLowerCase()})</dt><dd>{money(o.taxPaise)}</dd></div>
            <div className="flex justify-between border-t border-beige pt-2 text-base font-medium"><dt>Total</dt><dd>{money(o.totalPaise)}</dd></div>
          </dl>
        </section>
        <section aria-labelledby="cust-h" className="space-y-4 text-sm">
          <h2 id="cust-h" className="text-2xl">Customer</h2>
          <p>{o.contactName}<br />{o.contactEmail}<br />{o.contactPhone}</p>
          <address className="not-italic">{o.shipLine1}{o.shipLine2 ? `, ${o.shipLine2}` : ""}<br />{o.shipCity}, {o.shipState} {o.shipPincode}</address>
          {o.shipment ? <p>Shipment: {o.shipment.carrier ?? "carrier not recorded"} {o.shipment.trackingNumber ?? ""}</p> : null}
          {o.invoiceNumber ? <p>Invoice <Link className="underline" href={`/admin/orders/${o.id}/invoice`}>{o.invoiceNumber}</Link></p> : null}
          <div>
            <p className="font-medium">Payment attempts</p>
            <ul className="mt-1 text-xs text-cocoa">{o.payments.map((p) => <li key={p.id}>{p.provider} · {p.status.toLowerCase()} · {money(p.amountPaise)}{p.failureCode ? ` · ${p.failureCode}` : ""}</li>)}{o.payments.length === 0 ? <li>None</li> : null}</ul>
          </div>
        </section>
      </div>

      {canWrite ? (
        <section className="mt-10 grid max-w-3xl gap-6 sm:grid-cols-2" aria-labelledby="act-h">
          <h2 id="act-h" className="text-2xl sm:col-span-2">Actions</h2>
          {o.status === "PLACED" ? <ActionForm action={step("confirm")} submitLabel="Confirm order" /> : null}
          {o.status === "CONFIRMED" ? (
            <ActionForm action={step("ship")} submitLabel="Mark as shipped">
              <Field label="Carrier (optional)" name="carrier" />
              <Field label="Tracking number (optional)" name="tracking" />
            </ActionForm>
          ) : null}
          {o.status === "SHIPPED" ? <ActionForm action={step("deliver")} submitLabel={o.paymentMethod === "COD" ? "Mark delivered (cash collected)" : "Mark delivered"} /> : null}
          {o.status === "PENDING_PAYMENT" || o.status === "PLACED" || o.status === "CONFIRMED" ? (
            <ActionForm action={step("cancel")} submitLabel="Cancel order" variant="danger">
              <Field label="Reason" name="reason" required hint="Stock is returned to sellable inventory (or released from reservation)." />
            </ActionForm>
          ) : null}
          {o.paymentStatus === "REFUND_DUE" ? (
            <ActionForm action={step("refund")} submitLabel="Record refund">
              <Field label="Refund reference" name="note" required hint="e.g. the refund id from the payment dashboard." />
            </ActionForm>
          ) : null}
          {o.paymentStatus === "PAID" && !o.invoiceNumber ? <ActionForm action={step("invoice")} submitLabel="Issue GST invoice" variant="secondary" /> : null}
        </section>
      ) : null}
    </AdminShell>
  );
}
