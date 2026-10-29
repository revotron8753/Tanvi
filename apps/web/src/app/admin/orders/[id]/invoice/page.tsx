import { getPrisma } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/guard";
import { splitGst } from "@/server/orders/pricing";
import { getSettings } from "@/server/orders/settings";

export const dynamic = "force-dynamic";

const STATE_CODES: Record<string, string> = { "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh" };

/** Printable tax invoice. Only exists once an invoice number was issued, which requires complete business details. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("orders.read");
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [o, s] = await Promise.all([getPrisma().order.findUnique({ where: { id: id.data }, include: { items: true } }), getSettings(getPrisma())]);
  if (!o || !o.invoiceNumber) notFound();
  const m = (n: number) => formatPaise(paise(n));
  const buyerStateCode = Object.entries(STATE_CODES).find(([, name]) => name.toLowerCase() === o.shipState.trim().toLowerCase())?.[0] ?? null;
  const sameState = buyerStateCode !== null && buyerStateCode === s.businessStateCode;
  const gst = splitGst(o.taxPaise, sameState);
  return (
    <article className="mx-auto max-w-3xl bg-white p-8 text-sm print:p-0">
      <h1 className="text-3xl">Tax invoice</h1>
      <p className="mt-1">No. {o.invoiceNumber} · {o.invoicedAt?.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div><p className="font-medium">{s.legalName}</p><p className="whitespace-pre-line">{s.businessAddress}</p><p>GSTIN {s.gstin}</p></div>
        <div><p className="font-medium">Bill to</p><p>{o.contactName}</p><p>{o.shipLine1}, {o.shipCity}, {o.shipState} {o.shipPincode}</p><p>Order {o.reference}</p>{buyerStateCode === null ? <p className="text-danger">State code could not be determined from “{o.shipState}”. Tax split shown as IGST.</p> : null}</div>
      </div>
      <table className="mt-6 w-full text-left">
        <thead className="border-b"><tr><th>Item</th><th>HSN</th><th>Qty</th><th>Rate</th><th>GST %</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id} className="border-b"><td>{i.name} ({i.size}/{i.colour})</td><td>{i.hsnCode ?? "–"}</td><td>{i.quantity}</td><td>{m(i.unitPricePaise)}</td><td>{i.gstRateBps === null ? "–" : `${i.gstRateBps / 100}%`}</td><td className="text-right">{m(i.unitPricePaise * i.quantity - i.discountPaise)}</td></tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-4 w-64 space-y-1">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{m(o.subtotalPaise)}</dd></div>
        {o.discountPaise > 0 ? <div className="flex justify-between"><dt>Discount</dt><dd>−{m(o.discountPaise)}</dd></div> : null}
        <div className="flex justify-between"><dt>Shipping</dt><dd>{m(o.shippingPaise)}</dd></div>
        {gst.igst > 0 ? <div className="flex justify-between"><dt>IGST{o.taxMode === "INCLUSIVE" ? " (included)" : ""}</dt><dd>{m(gst.igst)}</dd></div> : <>
          <div className="flex justify-between"><dt>CGST{o.taxMode === "INCLUSIVE" ? " (included)" : ""}</dt><dd>{m(gst.cgst)}</dd></div>
          <div className="flex justify-between"><dt>SGST{o.taxMode === "INCLUSIVE" ? " (included)" : ""}</dt><dd>{m(gst.sgst)}</dd></div></>}
        <div className="flex justify-between border-t pt-1 font-medium"><dt>Total</dt><dd>{m(o.totalPaise)}</dd></div>
      </dl>
    </article>
  );
}
