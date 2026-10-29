"use client";

import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { createStaffOrderAction } from "./actions";

export interface VariantOption {
  id: string;
  label: string;
  available: number;
}

export function StaffOrderForm({ variants, idempotencyKey, codEnabled, onlineEnabled }: { variants: VariantOption[]; idempotencyKey: string; codEnabled: boolean; onlineEnabled: boolean }) {
  return (
    <ActionForm action={createStaffOrderAction} submitLabel="Create order and reserve stock" pendingLabel="Creating…" className="space-y-6">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <fieldset className="space-y-3">
        <legend className="mb-1 text-2xl">Items</legend>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem] gap-3">
            <div className="space-y-1.5">
              <label htmlFor={`variant${i}`} className="block text-sm font-medium">Item {i + 1}</label>
              <select id={`variant${i}`} name={`variant${i}`} className="min-h-11 w-full rounded-sm border border-taupe bg-white px-3">
                <option value="">{i === 0 ? "Choose an item…" : "None"}</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id} disabled={v.available <= 0}>{v.label} {v.available <= 0 ? "(out of stock)" : `(${v.available} available)`}</option>
                ))}
              </select>
            </div>
            <Field label="Qty" name={`qty${i}`} type="number" min={0} max={10} defaultValue={i === 0 ? 1 : 0} />
          </div>
        ))}
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-1 text-2xl">Customer and delivery</legend>
        <Field label="Full name" name="name" required />
        <Field label="Email" name="email" type="email" required hint="Needed for the order record." />
        <Field label="Mobile number" name="phone" type="tel" inputMode="numeric" required />
        <Field label="Address line 1" name="line1" required />
        <Field label="Address line 2" name="line2" />
        <div className="grid grid-cols-2 gap-4"><Field label="City" name="city" required /><Field label="State" name="state" required /></div>
        <Field label="PIN code" name="pincode" inputMode="numeric" maxLength={6} required />
        <Field label="Coupon (optional)" name="coupon" />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-2xl">Payment terms</legend>
        {onlineEnabled ? <label className="flex items-center gap-2"><input type="radio" name="paymentMethod" value="ONLINE" defaultChecked /> Customer pays online via a link we send</label> : null}
        {codEnabled ? <label className="flex items-center gap-2"><input type="radio" name="paymentMethod" value="COD" defaultChecked={!onlineEnabled} /> Cash on delivery</label> : null}
        {!onlineEnabled && !codEnabled ? <p className="text-danger" role="alert">Neither online payment nor COD is enabled. Configure one first.</p> : null}
        <p className="text-xs text-cocoa">Prices come from the catalogue; there is no custom-price override. Stock is reserved as soon as the order is created.</p>
      </fieldset>
    </ActionForm>
  );
}
