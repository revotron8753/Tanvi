import { getPrisma } from "@tanvi/database";
import { parseRupeesToPaise } from "@tanvi/domain";
import Link from "next/link";
import { ProductGrid } from "@/components/store/product-card";
import { listShopProducts, shopFacets, SORTS, type Sort } from "@/server/storefront/queries";

const PAGE_SIZE = 12;
export type SP = Record<string, string | string[] | undefined>;

const all = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);
const one = (v: string | string[] | undefined): string | undefined => all(v)[0]?.trim() || undefined;

export async function ShopListing({ basePath, categorySlug, sp, withSearchBox = false }: { basePath: string; categorySlug?: string; sp: SP; withSearchBox?: boolean }) {
  const prisma = getPrisma();
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);
  const sort = SORTS.find((s) => s === one(sp.sort)) as Sort | undefined;
  const minPaise = one(sp.min) ? (parseRupeesToPaise(one(sp.min) ?? "") ?? undefined) : undefined;
  const maxPaise = one(sp.max) ? (parseRupeesToPaise(one(sp.max) ?? "") ?? undefined) : undefined;
  const q = one(sp.q);
  const sizes = all(sp.size);
  const colours = all(sp.colour);
  const fabric = one(sp.fabric);

  const [facets, { total, items }] = await Promise.all([
    shopFacets(prisma, categorySlug),
    withSearchBox && !q
      ? Promise.resolve({ total: 0, items: [] })
      : listShopProducts(prisma, { categorySlug, q, sizes, colours, fabric, minPaise, maxPaise, sort, page, pageSize: PAGE_SIZE }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const keep = (over: Record<string, string>) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    sizes.forEach((s) => u.append("size", s));
    colours.forEach((c) => u.append("colour", c));
    if (fabric) u.set("fabric", fabric);
    if (one(sp.min)) u.set("min", one(sp.min) ?? "");
    if (one(sp.max)) u.set("max", one(sp.max) ?? "");
    if (sort) u.set("sort", sort);
    for (const [k, v] of Object.entries(over)) u.set(k, v);
    const s = u.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const filtered = Boolean(q || sizes.length || colours.length || fabric || minPaise !== undefined || maxPaise !== undefined);

  return (
    <div>
      {withSearchBox ? (
        <form role="search" action={basePath} className="mb-6 flex max-w-xl gap-2">
          <label className="sr-only" htmlFor="q">Search products</label>
          <input id="q" name="q" defaultValue={q} placeholder="Search kurtis, fabrics, colours…" className="min-h-11 flex-1 rounded-sm border border-taupe bg-white px-3" />
          <button className="min-h-11 rounded-sm bg-espresso px-5 text-sm text-ivory hover:bg-cocoa">Search</button>
        </form>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
        <form action={basePath} className="space-y-5 text-sm" aria-label="Filters">
          {q ? <input type="hidden" name="q" value={q} /> : null}
          {facets.sizes.length > 0 ? (
            <fieldset>
              <legend className="mb-2 font-medium">Size</legend>
              <div className="flex flex-wrap gap-2">
                {facets.sizes.map((s) => (
                  <label key={s} className="flex items-center gap-1">
                    <input type="checkbox" name="size" value={s} defaultChecked={sizes.includes(s)} /> {s}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {facets.colours.length > 0 ? (
            <fieldset>
              <legend className="mb-2 font-medium">Colour</legend>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {facets.colours.map((c) => (
                  <label key={c} className="flex items-center gap-1">
                    <input type="checkbox" name="colour" value={c} defaultChecked={colours.includes(c)} /> {c}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {facets.fabrics.length > 0 ? (
            <label className="block">
              <span className="mb-1 block font-medium">Fabric</span>
              <select name="fabric" defaultValue={fabric ?? ""} className="min-h-10 w-full rounded-sm border border-taupe bg-white px-2">
                <option value="">Any</option>
                {facets.fabrics.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
          ) : null}
          <fieldset>
            <legend className="mb-2 font-medium">Price (₹)</legend>
            <div className="flex items-center gap-2">
              <input name="min" inputMode="numeric" aria-label="Minimum price" placeholder="Min" defaultValue={one(sp.min)} className="min-h-10 w-full rounded-sm border border-taupe bg-white px-2" />
              –
              <input name="max" inputMode="numeric" aria-label="Maximum price" placeholder="Max" defaultValue={one(sp.max)} className="min-h-10 w-full rounded-sm border border-taupe bg-white px-2" />
            </div>
          </fieldset>
          <label className="block">
            <span className="mb-1 block font-medium">Sort by</span>
            <select name="sort" defaultValue={sort ?? "newest"} className="min-h-10 w-full rounded-sm border border-taupe bg-white px-2">
              <option value="newest">Newest</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </label>
          <div className="flex gap-3">
            <button className="min-h-10 rounded-sm bg-espresso px-4 text-ivory hover:bg-cocoa">Apply</button>
            {filtered ? <Link href={basePath} className="content-center underline">Clear</Link> : null}
          </div>
        </form>

        <section aria-live="polite">
          {withSearchBox && !q ? (
            <p className="text-cocoa">Type something to search the collection.</p>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-display text-2xl">{filtered ? "Nothing matches those filters" : "New pieces are on their way"}</p>
              <p className="mt-2 text-cocoa">{filtered ? "Try removing a filter or searching for something else." : "Please check back soon."}</p>
              {filtered ? <Link href={basePath} className="mt-4 inline-block underline">Clear filters</Link> : <Link href="/shop" className="mt-4 inline-block underline">Browse all</Link>}
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-cocoa">{total} {total === 1 ? "piece" : "pieces"}</p>
              <ProductGrid products={items} />
              <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-6 text-sm">
                {page > 1 ? <Link href={keep({ page: String(page - 1) })} rel="prev">← Previous</Link> : null}
                <span>Page {page} of {pages}</span>
                {page < pages ? <Link href={keep({ page: String(page + 1) })} rel="next">Next →</Link> : null}
              </nav>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
