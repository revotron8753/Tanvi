import { getPrisma } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const auth = await requireAdmin("customers.read");
  const customers = await getPrisma().customer.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { orders: { where: { status: { not: "CANCELLED" } }, select: { totalPaise: true } } } });
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Customers</h1>
      <p className="mt-2 text-sm text-cocoa">Created from orders. Exporting customer data is restricted to roles with the export permission and is not available here yet.</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">Customers</caption>
          <thead className="border-b border-beige text-cocoa"><tr>{["Name", "Email", "Phone", "Orders", "Spent"].map((h) => <th key={h} scope="col" className="py-2 pr-4">{h}</th>)}</tr></thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-beige"><td className="py-2 pr-4">{c.name}</td><td className="py-2 pr-4">{c.email}</td><td className="py-2 pr-4">{c.phone ?? "–"}</td><td className="py-2 pr-4">{c.orders.length}</td><td className="py-2 pr-4">{formatPaise(paise(c.orders.reduce((s, o) => s + o.totalPaise, 0)))}</td></tr>
            ))}
            {customers.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-cocoa">No customers yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
