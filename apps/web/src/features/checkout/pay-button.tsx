"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Script from "next/script";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { paymentFailedAction, verifyPaymentAction } from "./actions";

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", cb: (r: { error?: { code?: string } }) => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

export function PayButton(props: {
  keyId: string;
  amountPaise: number;
  providerOrderId: string;
  reference: string;
  token: string;
  contact: { name: string; email: string; phone: string };
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    if (!window.Razorpay) return setError("Payment form failed to load. Please refresh and try again.");
    setError(null);
    const rzp = new window.Razorpay({
      key: props.keyId,
      amount: props.amountPaise,
      currency: "INR",
      name: "Tanvi",
      order_id: props.providerOrderId,
      prefill: { name: props.contact.name, email: props.contact.email, contact: `+91${props.contact.phone}` },
      handler: async (r: RazorpayResponse) => {
        setBusy(true);
        const res = await verifyPaymentAction({ reference: props.reference, token: props.token, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
        if (res.ok) router.replace(`/order-confirmation/${props.reference}?t=${props.token}`);
        else {
          setBusy(false);
          setError(res.message ?? "We couldn't confirm your payment.");
        }
      },
      modal: { ondismiss: () => setBusy(false) },
    });
    rzp.on("payment.failed", (resp) => {
      void paymentFailedAction({ reference: props.reference, token: props.token, code: resp.error?.code ?? null });
      setError("The payment didn't go through. You can try again.");
    });
    rzp.open();
  }

  return (
    <div className="space-y-4">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" onReady={() => setReady(true)} onError={() => setError("The payment form could not be loaded.")} />
      {error ? <Alert>{error}</Alert> : null}
      <Button onClick={open} disabled={!ready || busy} className="w-full">
        {busy ? "Confirming payment…" : "Pay now"}
      </Button>
    </div>
  );
}
