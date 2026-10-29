import { getPrisma } from "@tanvi/database";
import { requireAdmin } from "@/server/auth/guard";
import { toCsv } from "@/server/catalog/csv";
import { parseRange } from "@/server/reports/queries";

export const dynamic = "force-dynamic";

/** Order export. Personal data (name, email, phone, address) is included only for roles with customers.export. */
export async function GET(req: Request): Promise<Response> {
  const auth = await requireAdmin("reports.read");
  const url = new URL(req.url);
  const range = parseRange(url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined);
  const withPii = auth.permissions.has("customers.export");
  const orders = await getPrisma().order.findMany({ where: { createdAt: { gte: range.from, lt: range.toExclusive } }, orderBy: { createdAt: "asc" }, take: 10000 });
  const header = ["reference", "createdAt", "status", "paymentStatus", "paymentMethod", "source", "subtotalPaise", "discountPaise", "shippingPaise", "codFeePaise", "taxPaise", "totalPaise", ...(withPii ? ["name", "email", "phone", "city", "state", "pincode"] : ["state", "pincode"])];
  const rows = orders.map((o) => [o.reference, o.createdAt.toISOString(), o.status, o.paymentStatus, o.paymentMethod, o.source, o.subtotalPaise, o.discountPaise, o.shippingPaise, o.codFeePaise, o.taxPaise, o.totalPaise, ...(withPii ? [o.contactName, o.contactEmail, o.contactPhone, o.shipCity, o.shipState, o.shipPincode] : [o.shipState, o.shipPincode])]);
  return new Response(toCsv([header, ...rows]), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="tanvi-orders-${range.fromText}_${range.toText}.csv"`, "Cache-Control": "private, no-store" },
  });
}
