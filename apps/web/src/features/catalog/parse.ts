import { parseRupeesToPaise } from "@tanvi/domain";
import type { ProductFields } from "@/server/catalog/products";

const text = (f: FormData, k: string, max = 2000): string | null => {
  const v = f.get(k);
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t === "" ? null : t;
};
const flag = (f: FormData, k: string): boolean => f.get(k) === "on";

/** Returns fields, or an error message. Prices are typed in rupees and converted without floats. */
export function parseProductForm(f: FormData): { ok: true; fields: ProductFields; slug: string | null } | { ok: false; message: string } {
  const name = text(f, "name", 200);
  const categoryId = text(f, "categoryId", 40);
  const priceText = text(f, "price", 20);
  if (!name) return { ok: false, message: "Enter a product name." };
  if (!categoryId) return { ok: false, message: "Choose a category." };
  const pricePaise = priceText ? parseRupeesToPaise(priceText) : null;
  if (pricePaise === null) return { ok: false, message: "Enter the price in rupees, for example 1999 or 1,999.50." };
  const compareText = text(f, "comparePrice", 20);
  const comparePricePaise = compareText ? parseRupeesToPaise(compareText) : null;
  if (compareText && comparePricePaise === null) return { ok: false, message: "The original price is not a valid amount." };
  return {
    ok: true,
    slug: text(f, "slug", 100),
    fields: {
      name,
      description: text(f, "description", 5000),
      categoryId,
      pricePaise,
      comparePricePaise,
      parentCode: text(f, "parentCode", 40)?.toUpperCase() ?? null,
      hsnCode: text(f, "hsnCode", 12),
      fabric: text(f, "fabric", 80),
      fit: text(f, "fit", 80),
      neckline: text(f, "neckline", 80),
      sleeveLength: text(f, "sleeveLength", 80),
      garmentLength: text(f, "garmentLength", 80),
      pattern: text(f, "pattern", 80),
      careInstructions: text(f, "careInstructions", 1000),
      isFeatured: flag(f, "isFeatured"),
      isNewArrival: flag(f, "isNewArrival"),
      showOnHomepage: flag(f, "showOnHomepage"),
      tryOnEligible: flag(f, "tryOnEligible"),
      seoTitle: text(f, "seoTitle", 120),
      seoDescription: text(f, "seoDescription", 300),
    },
  };
}
