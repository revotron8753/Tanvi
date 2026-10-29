import { getPrisma } from "@tanvi/database";
import { randomUUID } from "node:crypto";
import { AdminShell } from "@/components/admin-shell";
import { StaffOrderForm } from "@/features/orders/staff-order-form";
import { requireAdmin } from "@/server/auth/guard";
import { classifyAvailability } from "@/server/catalog/inventory";
import { getSettings } from "@/server/orders/settings";
import { getPaymentProvider } from "@/server/payments/instance";
import { LIVE } from "@/server/storefront/queries";

export const dynamic = "force-dynamic";

export default async function NewStaffOrderPage() {
  const auth = await requireAdmin("orders.write");
  const prisma = getPrisma();
  const [variants, settings] = await Promise.all([
    prisma.productVariant.findMany({ where: { isActive: true, product: LIVE }, orderBy: [{ product: { name: "asc" } }, { sku: "asc" }], take: 500, include: { product: { select: { name: true } }, balances: true } }),
    getSettings(prisma),
  ]);
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">New order (WhatsApp-assisted)</h1>
      <p className="mt-2 max-w-prose text-sm text-cocoa">Use this after you and the customer have agreed the items, availability and delivery on WhatsApp. The order is recorded with your name and the source “WhatsApp”.</p>
      <div className="mt-6 max-w-2xl">
        <StaffOrderForm
          idempotencyKey={randomUUID()}
          codEnabled={settings.codEnabled}
          onlineEnabled={getPaymentProvider() !== null}
          variants={variants.map((v) => ({ id: v.id, label: `${v.product.name} · ${v.size}/${v.colour} · ${v.sku}`, available: classifyAvailability(v.balances).available }))}
        />
      </div>
    </AdminShell>
  );
}
