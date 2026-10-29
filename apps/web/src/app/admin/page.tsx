import { getPrisma } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/server/auth/guard";
import { lowStockCount, parseRange, salesSummary } from "@/server/reports/queries";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const auth = await requireAdmin("dashboard.view");
  const prisma = getPrisma();
  const can = (p: Parameters<typeof auth.permissions.has>[0]) => auth.permissions.has(p);
  const today = new Date().toISOString();
  const day = parseRange(undefined, undefined, new Date(today));
  const todayRange = { ...day, from: new Date(day.toExclusive.getTime() - 86_400_000), fromText: day.toText };
  const [sales, low, products] = await Promise.all([
    can("orders.read") ? salesSummary(prisma, todayRange) : null,
    can("inventory.read") ? lowStockCount(prisma) : null,
    can("products.read") ? prisma.product.count({ where: { status: "DRAFT" } }) : null,
  ]);
  const tiles: [string, string, string][] = [
    ...(sales ? ([["Orders today", String(sales.ordersPlaced), "/admin/orders"], ["Paid sales today", formatPaise(paise(sales.paidSalesPaise)), "/admin/reports"], ["Awaiting payment", String(sales.awaitingPayment), "/admin/orders?status=PENDING_PAYMENT"], ["Refunds due", String(sales.refundsDue), "/admin/orders?pay=refund"]] as [string, string, string][]) : []),
    ...(low !== null ? ([["Low or out of stock", String(low), "/admin/inventory?filter=low"]] as [string, string, string][]) : []),
    ...(products !== null ? ([["Draft products", String(products), "/admin/products?status=DRAFT"]] as [string, string, string][]) : []),
  ];
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Welcome, {auth.user.name}</h1>
      <p className="mt-1 text-sm text-cocoa">Live figures from the database (India time). Nothing here is sample data.</p>
      {tiles.length > 0 ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map(([k, v, href]) => (
            <li key={k}><Link href={href} className="block border border-beige bg-white p-4 hover:bg-beige"><span className="text-sm text-cocoa">{k}</span><span className="mt-1 block font-display text-3xl">{v}</span></Link></li>
          ))}
        </ul>
      ) : <p className="mt-6 text-cocoa">Use the menu to get started.</p>}
    </AdminShell>
  );
}
