"use client";

import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { placeOrderAction } from "./actions";

export function CheckoutForm({ idempotencyKey, onlineAvailable, codAvailable, coupon, codFeeText }: { idempotencyKey: string; onlineAvailable: boolean; codAvailable: boolean; coupon: string | undefined; codFeeText: string | null }) {
  return (
    <ActionForm action={placeOrderAction} submitLabel="Place order" pendingLabel="Placing order…" className="space-y-6">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {coupon ? <input type="hidden" name="coupon" value={coupon} /> : null}
      <fieldset className="space-y-4">
        <legend className="mb-2 text-2xl">Contact</legend>
        <Field label="Full name" name="name" autoComplete="name" required />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Mobile number" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" hint="10-digit Indian mobile number" required />
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-2 text-2xl">Delivery address</legend>
        <Field label="Address line 1" name="line1" autoComplete="address-line1" required />
        <Field label="Address line 2 (optional)" name="line2" autoComplete="address-line2" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="City" name="city" autoComplete="address-level2" required />
          <Field label="State" name="state" autoComplete="address-level1" required />
        </div>
        <Field label="PIN code" name="pincode" inputMode="numeric" autoComplete="postal-code" maxLength={6} required />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-2xl">Payment</legend>
        {onlineAvailable ? (
          <label className="flex items-center gap-2"><input type="radio" name="paymentMethod" value="ONLINE" defaultChecked /> Pay online (UPI, cards, netbanking)</label>
        ) : null}
        {codAvailable ? (
          <label className="flex items-center gap-2"><input type="radio" name="paymentMethod" value="COD" defaultChecked={!onlineAvailable} /> Cash on delivery{codFeeText ? ` (${codFeeText})` : ""}</label>
        ) : null}
        {!onlineAvailable && !codAvailable ? <p className="text-danger" role="alert">Checkout isn&apos;t available right now. Please contact the store.</p> : null}
      </fieldset>
    </ActionForm>
  );
}
