import { getPrisma } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/server/auth/guard";
import { parseRange, salesSummary } from "@/server/reports/queries";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const auth = await requireAdmin("reports.read");
  const sp = await searchParams;
  const range = parseRange(sp.from, sp.to);
  const s = await salesSummary(getPrisma(), range);
  const m = (n: number) => formatPaise(paise(n));
  const tiles: [string, string][] = [
    ["Orders placed", String(s.ordersPlaced)],
    ["Paid sales", m(s.paidSalesPaise)],
    ["Average paid order", s.paidOrders ? m(s.averagePaidOrderPaise) : "–"],
    ["Units sold", String(s.unitsSold)],
    ["Cancelled orders", String(s.ordersCancelled)],
    ["Awaiting payment (now)", String(s.awaitingPayment)],
    ["Refunds due (now)", String(s.refundsDue)],
  ];
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Reports</h1>
      <form className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">From<input type="date" name="from" defaultValue={range.fromText} className="mt-1 block min-h-11 rounded-sm border border-taupe bg-white px-3" /></label>
        <label className="text-sm">To<input type="date" name="to" defaultValue={range.toText} className="mt-1 block min-h-11 rounded-sm border border-taupe bg-white px-3" /></label>
        <button className="min-h-11 rounded-sm border border-espresso px-5 text-sm hover:bg-beige">Apply</button>
        <a className="min-h-11 content-center text-sm underline" href={`/admin/reports/export?from=${range.fromText}&to=${range.toText}`}>Export orders (CSV)</a>
      </form>
      <p className="mt-2 text-xs text-cocoa">Whole days in India time, {range.fromText} to {range.toText}. All figures come from real orders; nothing is estimated.</p>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} className="border border-beige bg-white p-4"><dt className="text-sm text-cocoa">{k}</dt><dd className="mt-1 font-display text-3xl">{v}</dd></div>
        ))}
      </dl>
      <section className="mt-10" aria-labelledby="top-h">
        <h2 id="top-h" className="text-2xl">Top products by units</h2>
        {s.topProducts.length === 0 ? <p className="mt-2 text-sm text-cocoa">No orders in this period.</p> : (
          <table className="mt-2 text-left text-sm"><caption className="sr-only">Top products</caption><thead className="text-cocoa"><tr><th scope="col" className="pr-6">Product</th><th scope="col">Units</th></tr></thead>
            <tbody>{s.topProducts.map((t) => <tr key={t.name}><td className="pr-6">{t.name}</td><td>{t.units}</td></tr>)}</tbody></table>
        )}
      </section>
      <section className="mt-10 max-w-prose text-sm text-cocoa" aria-labelledby="def-h">
        <h2 id="def-h" className="text-xl text-espresso">How these are defined</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Orders placed</strong>: created in the period, excluding cancelled.</li>
          <li><strong>Paid sales</strong>: order totals (including shipping, COD fee and any added GST) for orders marked paid. COD counts once cash is recorded at delivery.</li>
          <li><strong>Units sold</strong>: quantities on non-cancelled orders.</li>
        </ul>
      </section>
    </AdminShell>
  );
}
