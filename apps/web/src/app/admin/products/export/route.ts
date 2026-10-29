import { getPrisma } from "@tanvi/database";
import { requireAdmin } from "@/server/auth/guard";
import { toCsv } from "@/server/catalog/csv";
import { PRODUCT_CSV_COLUMNS } from "@/server/catalog/products";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  await requireAdmin("products.read");
  const products = await getPrisma().product.findMany({
    orderBy: { createdAt: "asc" },
    take: 5000,
    include: { category: true, variants: { include: { balances: true }, orderBy: { sku: "asc" } } },
  });
  const rows: (string | number | null)[][] = [[...PRODUCT_CSV_COLUMNS]];
  for (const p of products) {
    const variants = p.variants.length ? p.variants : [null];
    for (const v of variants) {
      rows.push([p.parentCode, p.name, p.category.name, p.status, p.pricePaise, p.comparePricePaise, p.hsnCode, p.fabric, v?.sku ?? null, v?.size ?? null, v?.colour ?? null, v ? v.balances.reduce((s, b) => s + b.onHand, 0) : null]);
    }
  }
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="tanvi-products.csv"', "Cache-Control": "private, no-store" },
  });
}
