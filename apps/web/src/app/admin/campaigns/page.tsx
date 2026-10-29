import { getPrisma } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { saveCouponAction, toggleCouponAction } from "@/features/orders/actions";
import { requireAdmin } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const auth = await requireAdmin("campaigns.write");
  const coupons = await getPrisma().coupon.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Coupons</h1>
      <p className="mt-2 text-sm text-cocoa">Discounts are validated and applied on the server at checkout. Campaign tracking and WhatsApp campaigns arrive with the messaging phase.</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Coupons</caption>
          <thead className="border-b border-beige text-cocoa"><tr>{["Code", "Discount", "Minimum", "Used", "Ends", "Active"].map((h) => <th key={h} scope="col" className="py-2 pr-4">{h}</th>)}<th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-b border-beige">
                <td className="py-2 pr-4 font-mono">{c.code}</td>
                <td className="py-2 pr-4">{c.type === "PERCENT" ? `${c.value / 100}%` : formatPaise(paise(c.value))}</td>
                <td className="py-2 pr-4">{formatPaise(paise(c.minSubtotalPaise))}</td>
                <td className="py-2 pr-4">{c.usedCount}{c.maxUses !== null ? ` / ${c.maxUses}` : ""}</td>
                <td className="py-2 pr-4">{c.endsAt ? c.endsAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "–"}</td>
                <td className="py-2 pr-4">{c.isActive ? "Yes" : "No"}</td>
                <td><form action={toggleCouponAction}><input type="hidden" name="id" value={c.id} /><Button type="submit" variant="ghost" className="min-h-9 px-2 text-xs">{c.isActive ? "Disable" : "Enable"}</Button></form></td>
              </tr>
            ))}
            {coupons.length === 0 ? <tr><td colSpan={7} className="py-8 text-center text-cocoa">No coupons yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <section className="mt-10 max-w-md space-y-3" aria-labelledby="nc-h">
        <h2 id="nc-h" className="text-2xl">New coupon</h2>
        <ActionForm action={saveCouponAction} submitLabel="Create coupon">
          <Field label="Code" name="code" required />
          <Select label="Type" name="type"><option value="PERCENT">Percentage</option><option value="FIXED">Fixed amount (₹)</option></Select>
          <Field label="Value" name="value" inputMode="decimal" required hint="Percent (e.g. 10) or rupees (e.g. 500)." />
          <Field label="Minimum bag value (₹, optional)" name="min" inputMode="decimal" />
          <Field label="Maximum discount (₹, optional)" name="max" inputMode="decimal" />
          <Field label="Maximum total uses (optional)" name="maxUses" type="number" min={1} />
          <Field label="Last valid day (optional)" name="endsAt" type="date" />
        </ActionForm>
      </section>
    </AdminShell>
  );
}
