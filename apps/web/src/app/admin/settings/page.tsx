import { getPrisma } from "@tanvi/database";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { Field } from "@/components/ui/field";
import { Select, Textarea } from "@/components/ui/select";
import { saveSettingsAction } from "@/features/orders/actions";
import { requireAdmin } from "@/server/auth/guard";
import { getSettings, invoiceBlockers } from "@/server/orders/settings";
import { getPaymentProvider } from "@/server/payments/instance";

export const dynamic = "force-dynamic";
const rupees = (p: number | null): string => (p === null ? "" : `${Math.trunc(p / 100)}${p % 100 ? `.${String(p % 100).padStart(2, "0")}` : ""}`);

export default async function SettingsPage() {
  const auth = await requireAdmin("settings.read");
  const s = await getSettings(getPrisma());
  const canWrite = auth.permissions.has("settings.write");
  const blockers = invoiceBlockers(s);
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Business settings</h1>
      <section className="mt-4 space-y-1 text-sm" aria-label="Integration status">
        <p>Online payments (Razorpay): <strong>{getPaymentProvider() ? "credentials configured (not yet verified with a live test)" : "not configured. Online checkout is hidden"}</strong></p>
        <p>GST invoices: <strong>{blockers.length === 0 ? "ready" : `blocked. ${blockers.join(" ")}`}</strong></p>
      </section>
      {canWrite ? (
        <div className="mt-6 max-w-2xl">
          <ActionForm action={saveSettingsAction} submitLabel="Save settings">
            <fieldset className="space-y-4"><legend className="mb-2 text-2xl">Tax</legend>
              <Select label="Are listed prices GST-inclusive?" name="taxMode" defaultValue={s.taxMode}>
                <option value="UNSET">Not decided: no tax is calculated or shown</option>
                <option value="INCLUSIVE">Prices include GST</option>
                <option value="EXCLUSIVE">GST is added on top of prices</option>
              </Select>
              <Field label="Registered business name" name="legalName" defaultValue={s.legalName} />
              <Field label="GSTIN" name="gstin" defaultValue={s.gstin} />
              <Textarea label="Registered address" name="businessAddress" defaultValue={s.businessAddress} rows={3} />
              <Field label="Business GST state code (2 digits)" name="businessStateCode" defaultValue={s.businessStateCode} hint="e.g. 27 for Maharashtra. Decides IGST vs CGST+SGST." />
              <Field label="Invoice number prefix" name="invoicePrefix" defaultValue={s.invoicePrefix} hint="Invoices look like PREFIX/2026/00001." />
              <p className="text-xs text-cocoa">Product GST rates and HSN codes are set per product. Confirm current rates with your accountant. Shipping and COD fees are treated as non-taxable until you confirm otherwise.</p>
            </fieldset>
            <fieldset className="space-y-4"><legend className="mb-2 text-2xl">Shipping</legend>
              <Field label="Flat shipping charge (₹)" name="shippingFlat" defaultValue={rupees(s.shippingFlatPaise)} />
              <Field label="Free shipping above (₹, optional)" name="freeShipping" defaultValue={rupees(s.freeShippingThresholdPaise)} />
            </fieldset>
            <fieldset className="space-y-4"><legend className="mb-2 text-2xl">Cash on delivery</legend>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="codEnabled" defaultChecked={s.codEnabled} /> Offer cash on delivery</label>
              <Field label="Maximum COD order (₹, optional)" name="codMax" defaultValue={rupees(s.codMaxOrderPaise)} />
              <Field label="COD fee (₹)" name="codFee" defaultValue={rupees(s.codFeePaise)} />
            </fieldset>
            <fieldset className="space-y-4"><legend className="mb-2 text-2xl">Stock</legend>
              <Field label="Hold unpaid online orders for (minutes)" name="reservationMinutes" type="number" min={5} max={1440} defaultValue={s.reservationMinutes} />
            </fieldset>
          </ActionForm>
        </div>
      ) : <p className="mt-6 text-sm text-cocoa">You can view but not change these settings.</p>}
    </AdminShell>
  );
}
