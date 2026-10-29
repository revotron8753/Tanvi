import type { PrismaClient } from "@tanvi/database";
import { parseRupeesToPaise } from "@tanvi/domain";
import { parseCsv } from "./csv";
import { addVariant, createProduct, PRODUCT_CSV_COLUMNS, type ProductFields } from "./products";

export interface ImportReport {
  created: number;
  variantsAdded: number;
  errors: { line: number; message: string }[];
}

const MAX_ROWS = 2000;

/**
 * Creates NEW draft products (grouped by parentCode) with their variants and opening stock.
 * Existing parent codes are never overwritten. All-or-nothing validation first; creation only if there are no errors.
 */
export async function importProductsCsv(prisma: PrismaClient, csv: string, actorId: string, dryRun: boolean): Promise<ImportReport> {
  const report: ImportReport = { created: 0, variantsAdded: 0, errors: [] };
  const rows = parseCsv(csv);
  const header = rows[0]?.map((h) => h.trim());
  if (!header) return { ...report, errors: [{ line: 1, message: "The file is empty." }] };
  const missing = ["parentCode", "name", "category", "pricePaise", "size", "colour"].filter((c) => !header.includes(c));
  if (missing.length) return { ...report, errors: [{ line: 1, message: `Missing columns: ${missing.join(", ")}. Expected: ${PRODUCT_CSV_COLUMNS.join(", ")}.` }] };
  if (rows.length - 1 > MAX_ROWS) return { ...report, errors: [{ line: 1, message: `At most ${MAX_ROWS} rows per import.` }] };

  const col = (r: string[], name: string): string => (r[header.indexOf(name)] ?? "").trim();
  const categories = await prisma.category.findMany();
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

  type Group = { line: number; fields: ProductFields; variants: { line: number; size: string; colour: string; sku: string; stock: number }[] };
  const groups = new Map<string, Group>();
  const seenVariants = new Set<string>();

  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const code = col(r, "parentCode").toUpperCase();
    const fail = (message: string) => report.errors.push({ line, message });
    if (!code) return fail("parentCode is required.");
    if (!/^\d{1,9}$/.test(col(r, "pricePaise")) || parseRupeesToPaise(centsToRupees(col(r, "pricePaise"))) === null) return fail("pricePaise must be a whole number of paise.");
    const catId = byName.get(col(r, "category").toLowerCase());
    if (!catId) return fail(`Unknown category "${col(r, "category")}".`);
    const stockText = col(r, "onHand") || "0";
    if (!/^\d{1,6}$/.test(stockText)) return fail("onHand must be a whole number.");
    const size = col(r, "size");
    const colour = col(r, "colour");
    if (!size || !colour) return fail("size and colour are required.");
    const key = `${code}|${size.toLowerCase()}|${colour.toLowerCase()}`;
    if (seenVariants.has(key)) return fail("Duplicate size/colour for this parentCode.");
    seenVariants.add(key);

    let g = groups.get(code);
    if (!g) {
      const compare = col(r, "comparePricePaise");
      g = {
        line,
        fields: {
          name: col(r, "name"), description: null, categoryId: catId, pricePaise: Number(col(r, "pricePaise")),
          comparePricePaise: compare && /^\d{1,9}$/.test(compare) ? Number(compare) : null,
          parentCode: code, hsnCode: col(r, "hsnCode") || null, fabric: col(r, "fabric") || null,
          fit: null, neckline: null, sleeveLength: null, garmentLength: null, pattern: null, careInstructions: null, sizeChart: null,
          isFeatured: false, isNewArrival: false, showOnHomepage: false, tryOnEligible: false, seoTitle: null, seoDescription: null,
        },
        variants: [],
      };
      groups.set(code, g);
    }
    g.variants.push({ line, size, colour, sku: col(r, "sku"), stock: Number(stockText) });
  });

  const existing = await prisma.product.findMany({ where: { parentCode: { in: [...groups.keys()] } }, select: { parentCode: true } });
  for (const e of existing) report.errors.push({ line: groups.get(e.parentCode ?? "")?.line ?? 0, message: `Parent code ${e.parentCode} already exists; import never overwrites products.` });
  const skus = [...groups.values()].flatMap((g) => g.variants.map((v) => v.sku.toUpperCase()).filter(Boolean));
  const takenSkus = await prisma.productVariant.findMany({ where: { sku: { in: skus } }, select: { sku: true } });
  for (const t of takenSkus) report.errors.push({ line: 0, message: `SKU ${t.sku} already exists.` });

  if (report.errors.length > 0 || dryRun) {
    report.created = report.errors.length ? 0 : groups.size;
    report.variantsAdded = report.errors.length ? 0 : [...groups.values()].reduce((s, g) => s + g.variants.length, 0);
    return report;
  }

  for (const g of groups.values()) {
    const p = await createProduct(prisma, g.fields, actorId);
    if (!p.ok) {
      report.errors.push({ line: g.line, message: p.message });
      continue;
    }
    report.created++;
    for (const v of g.variants) {
      const res = await addVariant(prisma, p.id, { size: v.size, colour: v.colour, sku: v.sku, pricePaise: null, initialStock: v.stock }, actorId);
      if (res.ok) report.variantsAdded++;
      else report.errors.push({ line: v.line, message: res.message });
    }
  }
  return report;
}

/** Digits-only paise string → "rupees.paise" text, via string ops. */
function centsToRupees(p: string): string {
  const padded = p.padStart(3, "0");
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
}
