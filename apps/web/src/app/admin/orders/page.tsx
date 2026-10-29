import { getPrisma } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/server/auth/guard";
import { STATUS_LABEL, type OrderStatus } from "@/server/orders/state";

export const dynamic = "force-dynamic";
const PAGE = 25;
const STATUSES = Object.keys(STATUS_LABEL) as OrderStatus[];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await requireAdmin("orders.read");
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const status = STATUSES.find((s) => s === sp.status);
  const q = sp.q?.trim();
  const where = {
    ...(status ? { status } : {}),
    ...(sp.pay === "refund" ? { paymentStatus: "REFUND_DUE" as const } : {}),
    ...(q ? { OR: [{ reference: { contains: q.toUpperCase() } }, { contactEmail: { contains: q.toLowerCase() } }, { contactPhone: { contains: q } }, { contactName: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [total, orders] = await Promise.all([
    getPrisma().order.count({ where }),
    getPrisma().order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <AdminShell auth={auth}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">Orders</h1>
        {auth.permissions.has("orders.write") ? <Link href="/admin/orders/new" className="inline-flex min-h-11 items-center rounded-sm bg-espresso px-5 text-sm text-ivory hover:bg-cocoa">New WhatsApp order</Link> : null}
      </div>
      <form className="mt-6 flex flex-wrap items-end gap-3" role="search">
        <label className="text-sm">Search<input name="q" defaultValue={q} placeholder="Reference, name, email, phone" className="mt-1 block min-h-11 rounded-sm border border-taupe bg-white px-3" /></label>
        <label className="text-sm">Status
          <select name="status" defaultValue={status ?? ""} className="mt-1 block min-h-11 rounded-sm border border-taupe bg-white px-3">
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="pay" value="refund" defaultChecked={sp.pay === "refund"} /> Refund due</label>
        <button className="min-h-11 rounded-sm border border-espresso px-5 text-sm hover:bg-beige">Filter</button>
      </form>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <caption className="sr-only">Orders</caption>
          <thead className="border-b border-beige text-cocoa"><tr>
            {["Order", "Placed", "Customer", "Total", "Payment", "Status"].map((h) => <th key={h} scope="col" className="py-2 pr-4">{h}</th>)}
          </tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-beige">
                <td className="py-2 pr-4"><Link className="underline" href={`/admin/orders/${o.id}`}>{o.reference}</Link></td>
                <td className="py-2 pr-4">{o.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="py-2 pr-4">{o.contactName}</td>
                <td className="py-2 pr-4">{formatPaise(paise(o.totalPaise))}</td>
                <td className="py-2 pr-4">{o.paymentMethod === "COD" ? "COD · " : "Online · "}{o.paymentStatus.replace("_", " ").toLowerCase()}</td>
                <td className="py-2 pr-4">{STATUS_LABEL[o.status]}</td>
              </tr>
            ))}
            {orders.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-cocoa">{total === 0 && !q && !status ? "No orders yet." : "No orders match."}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="mt-3 flex gap-4 text-sm">
        <span>Page {page} of {pages} · {total} orders</span>
        {page > 1 ? <Link href={`/admin/orders?page=${page - 1}${q ? `&q=${q}` : ""}${status ? `&status=${status}` : ""}`}>Previous</Link> : null}
        {page < pages ? <Link href={`/admin/orders?page=${page + 1}${q ? `&q=${q}` : ""}${status ? `&status=${status}` : ""}`}>Next</Link> : null}
      </nav>
    </AdminShell>
  );
}
