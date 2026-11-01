import { getPrisma } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { retryPaymentAction } from "@/features/checkout/actions";
import { PayButton } from "@/features/checkout/pay-button";
import { getOrderForToken } from "@/server/orders/service";
import { getPaymentProvider } from "@/server/payments/instance";

export const metadata: Metadata = { title: "Payment", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function PayPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ t?: string }> }) {
  const { reference } = await params;
  const token = (await searchParams).t;
  const order = await getOrderForToken(getPrisma(), reference, token);
  if (!order || !token) notFound();
  if (order.status !== "PENDING_PAYMENT") redirect(`/order-confirmation/${reference}?t=${token}`);
  const provider = getPaymentProvider();
  const attempt = order.payments[0];
  const expired = order.reservationExpiresAt !== null && order.reservationExpiresAt <= new Date();

  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <h1 className="text-4xl">Complete your payment</h1>
      <p className="text-cocoa">Order {order.reference} · {formatPaise(paise(order.totalPaise))}</p>
      {expired ? (
        <p role="alert" className="text-danger">This order has expired. Please add your items to the bag again.</p>
      ) : !provider ? (
        <p role="alert" className="text-danger">Online payment is not available right now.</p>
      ) : attempt && attempt.status === "CREATED" ? (
        <PayButton keyId={provider.keyId} amountPaise={attempt.amountPaise} providerOrderId={attempt.providerOrderId} reference={order.reference} token={token} contact={{ name: order.contactName, email: order.contactEmail, phone: order.contactPhone }} />
      ) : (
        <form action={retryPaymentAction.bind(null, order.reference, token)}>
          <p className="mb-4 text-sm text-cocoa">Your last payment attempt didn&apos;t complete.</p>
          <Button type="submit" className="w-full">Try payment again</Button>
        </form>
      )}
      <p className="text-xs text-cocoa">Your items are held for a short time while you pay.</p>
    </div>
  );
}
