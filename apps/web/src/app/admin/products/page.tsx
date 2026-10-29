import { getPrisma } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/server/auth/guard";
import { listProducts } from "@/server/catalog/products";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;
const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await requireAdmin("products.read");
  const sp = await searchParams;
  const prisma = getPrisma();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const status = STATUSES.find((s) => s === sp.status);
  const [categories, { total, items }] = await Promise.all([
    prisma.category.findMany({ orderBy: { displayOrder: "asc" } }),
    listProducts(prisma, { q: sp.q?.trim() || undefined, status, categoryId: sp.category || undefined, page, pageSize: PAGE_SIZE }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (over: Record<string, string>) => new URLSearchParams(Object.entries({ q: sp.q, status: sp.status, category: sp.category, ...over }).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  return (
    <AdminShell auth={auth}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">Products</h1>
        {auth.permissions.has("products.write") ? (
          <Link href="/admin/products/new" className="inline-flex min-h-11 items-center rounded-sm bg-espresso px-5 text-sm text-ivory hover:bg-cocoa">
            New product
          </Link>
        ) : null}
      </div>
      <form className="mt-6 flex flex-wrap items-end gap-3" role="search">
        <label className="text-sm">
          Search
          <input name="q" defaultValue={sp.q} placeholder="Name, code or SKU" className="mt-1 block min-h-11 rounded-sm border border-taupe bg-white px-3" />
        </label>
        <label className="text-sm">
          Status
          <select name="status" defaultValue={sp.status ?? ""} className="mt-1 block min-h-11 rounded-sm border border-taupe bg-white px-3">
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Category
          <select name="category" defaultValue={sp.category ?? ""} className="mt-1 block min-h-11 rounded-sm border border-taupe bg-white px-3">
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className="min-h-11 rounded-sm border border-espresso px-5 text-sm hover:bg-beige">Filter</button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page */}
        <a href="/admin/products/export" className="min-h-11 content-center text-sm underline">Export CSV</a>
        {auth.permissions.has("products.write") ? <Link href="/admin/products/import" className="min-h-11 content-center text-sm underline">Import CSV</Link> : null}
      </form>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Products</caption>
          <thead className="border-b border-beige text-cocoa">
            <tr>
              <th scope="col" className="py-2 pr-4">Product</th>
              <th scope="col" className="py-2 pr-4">Category</th>
              <th scope="col" className="py-2 pr-4">Price</th>
              <th scope="col" className="py-2 pr-4">Variants</th>
              <th scope="col" className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-beige">
                <td className="py-2 pr-4">
                  <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 underline-offset-4 hover:underline">
                    {p.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/media/${p.images[0].storageKey}/thumb.webp`} alt="" width={40} height={52} className="h-[52px] w-10 rounded-sm object-cover" />
                    ) : (
                      <span className="grid h-[52px] w-10 place-items-center rounded-sm bg-beige text-xs text-cocoa" aria-hidden>
                        –
                      </span>
                    )}
                    {p.name}
                  </Link>
                </td>
                <td className="py-2 pr-4">{p.category.name}</td>
                <td className="py-2 pr-4">{formatPaise(paise(p.pricePaise))}</td>
                <td className="py-2 pr-4">{p._count.variants}</td>
                <td className="py-2 pr-4">{p.status.charAt(0) + p.status.slice(1).toLowerCase()}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-cocoa">
                  {total === 0 && !sp.q && !sp.status && !sp.category ? "No products yet. Create your first product to get started." : "No products match these filters."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="mt-4 flex items-center gap-4 text-sm">
        <span>
          Page {page} of {pages} · {total} products
        </span>
        {page > 1 ? <Link href={`/admin/products?${qs({ page: String(page - 1) })}`}>Previous</Link> : null}
        {page < pages ? <Link href={`/admin/products?${qs({ page: String(page + 1) })}`}>Next</Link> : null}
      </nav>
    </AdminShell>
  );
}
