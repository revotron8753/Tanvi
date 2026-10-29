import { getPrisma } from "@tanvi/database";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { adjustStockAction, setThresholdAction } from "@/features/catalog/actions";
import { requireAdmin } from "@/server/auth/guard";
import { classifyAvailability } from "@/server/catalog/inventory";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

const LABEL = { in_stock: "In stock", low_stock: "Low stock", out_of_stock: "Out of stock" } as const;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await requireAdmin("inventory.read");
  const sp = await searchParams;
  const prisma = getPrisma();
  const canAdjust = auth.permissions.has("inventory.adjust");
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [locations, variants, total, movements] = await Promise.all([
    prisma.stockLocation.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.productVariant.findMany({
      where: { isActive: true, product: { status: { not: "ARCHIVED" } }, ...(sp.q ? { OR: [{ sku: { contains: sp.q, mode: "insensitive" } }, { product: { name: { contains: sp.q, mode: "insensitive" } } }] } : {}) },
      orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { product: { select: { name: true } }, balances: true },
    }),
    prisma.productVariant.count({ where: { isActive: true, product: { status: { not: "ARCHIVED" } } } }),
    prisma.inventoryMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { variant: { select: { sku: true } }, actor: { select: { name: true } } },
    }),
  ]);
  const defaultLocation = locations[0];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = variants.map((v) => ({ v, ...classifyAvailability(v.balances), onHand: v.balances.reduce((s, b) => s + b.onHand, 0), reserved: v.balances.reduce((s, b) => s + b.reserved, 0) }));
  const visible = sp.filter === "low" ? rows.filter((r) => r.status !== "in_stock") : rows;

  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Inventory</h1>
      <p className="mt-2 max-w-prose text-sm text-cocoa">Available = on hand − reserved. Every change is recorded with who, when and why. Store sales are entered manually; there is no POS connection.</p>
      <form className="mt-6 flex flex-wrap items-end gap-3" role="search">
        <label className="text-sm">
          Search
          <input name="q" defaultValue={sp.q} placeholder="SKU or product" className="mt-1 block min-h-11 rounded-sm border border-taupe bg-white px-3" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="filter" value="low" defaultChecked={sp.filter === "low"} /> Low or out of stock only
        </label>
        <button className="min-h-11 rounded-sm border border-espresso px-5 text-sm hover:bg-beige">Apply</button>
      </form>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <caption className="sr-only">Stock by variant</caption>
          <thead className="border-b border-beige text-cocoa">
            <tr>
              <th scope="col" className="py-2 pr-4">SKU</th>
              <th scope="col" className="py-2 pr-4">Product</th>
              <th scope="col" className="py-2 pr-4">Size / colour</th>
              <th scope="col" className="py-2 pr-4">On hand</th>
              <th scope="col" className="py-2 pr-4">Reserved</th>
              <th scope="col" className="py-2 pr-4">Available</th>
              <th scope="col" className="py-2 pr-4">Status</th>
              {canAdjust ? <th scope="col" className="py-2 pr-4">Low-stock at</th> : null}
            </tr>
          </thead>
          <tbody>
            {visible.map(({ v, available, status, onHand, reserved }) => (
              <tr key={v.id} className="border-b border-beige">
                <td className="py-2 pr-4 font-mono text-xs">{v.sku}</td>
                <td className="py-2 pr-4">{v.product.name}</td>
                <td className="py-2 pr-4">{v.size} / {v.colour}</td>
                <td className="py-2 pr-4">{onHand}</td>
                <td className="py-2 pr-4">{reserved}</td>
                <td className="py-2 pr-4 font-medium">{available}</td>
                <td className={`py-2 pr-4 ${status === "in_stock" ? "" : "text-danger"}`}>{LABEL[status]}</td>
                {canAdjust && defaultLocation ? (
                  <td className="py-2 pr-4">
                    <form action={setThresholdAction} className="flex items-center gap-1">
                      <input type="hidden" name="variantId" value={v.id} />
                      <input type="hidden" name="locationId" value={defaultLocation.id} />
                      <input name="threshold" type="number" min={0} aria-label={`Low-stock threshold for ${v.sku}`} defaultValue={v.balances[0]?.lowStockThreshold ?? 2} className="min-h-9 w-16 rounded-sm border border-taupe px-2" />
                      <Button type="submit" variant="ghost" className="min-h-9 px-2 text-xs">Set</Button>
                    </form>
                  </td>
                ) : null}
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-cocoa">No variants to show. Add variants on a product page.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="mt-3 flex gap-4 text-sm">
        <span>Page {page} of {pages}</span>
        {page > 1 ? <Link href={`/admin/inventory?page=${page - 1}`}>Previous</Link> : null}
        {page < pages ? <Link href={`/admin/inventory?page=${page + 1}`}>Next</Link> : null}
      </nav>

      {canAdjust && defaultLocation ? (
        <section className="mt-10 max-w-md space-y-3" aria-labelledby="adj-h">
          <h2 id="adj-h" className="text-2xl">Change stock</h2>
          <ActionForm action={adjustStockAction} submitLabel="Apply change">
            <input type="hidden" name="locationId" value={defaultLocation.id} />
            <Select label="Variant" name="variantId" required>
              {rows.map(({ v }) => (
                <option key={v.id} value={v.id}>{v.sku} — {v.product.name} ({v.size}/{v.colour})</option>
              ))}
            </Select>
            <Select label="Action" name="mode">
              <option value="adjust">Add or remove units (+/−)</option>
              <option value="set">Set counted quantity (stocktake)</option>
              <option value="store_sale">Record an in-store sale</option>
            </Select>
            <Field label="Quantity" name="quantity" type="number" required hint="Use a negative number to remove units. For a stocktake enter the counted total." />
            <Field label="Reason / reference" name="reason" required hint="Required, e.g. “New delivery”, “Damaged”, “Bill #1042”." />
          </ActionForm>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="mv-h">
        <h2 id="mv-h" className="text-2xl">Recent movements</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Recent stock movements</caption>
            <thead className="border-b border-beige text-cocoa">
              <tr>
                <th scope="col" className="py-2 pr-4">When</th>
                <th scope="col" className="py-2 pr-4">SKU</th>
                <th scope="col" className="py-2 pr-4">Type</th>
                <th scope="col" className="py-2 pr-4">On hand Δ</th>
                <th scope="col" className="py-2 pr-4">Reserved Δ</th>
                <th scope="col" className="py-2 pr-4">Reason</th>
                <th scope="col" className="py-2 pr-4">By</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-beige">
                  <td className="py-2 pr-4">{m.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{m.variant.sku}</td>
                  <td className="py-2 pr-4">{m.type.toLowerCase().replace(/_/g, " ")}</td>
                  <td className="py-2 pr-4">{m.deltaOnHand}</td>
                  <td className="py-2 pr-4">{m.deltaReserved}</td>
                  <td className="py-2 pr-4">{m.reason ?? m.reference ?? "–"}</td>
                  <td className="py-2 pr-4">{m.actor?.name ?? "system"}</td>
                </tr>
              ))}
              {movements.length === 0 ? <tr><td colSpan={7} className="py-6 text-center text-cocoa">No stock movements yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
