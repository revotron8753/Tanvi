import { getPrisma } from "@tanvi/database";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { createProductAction } from "@/features/catalog/actions";
import { ProductFields } from "@/features/catalog/product-fields";
import { requireAdmin } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const auth = await requireAdmin("products.write");
  const categories = await getPrisma().category.findMany({ orderBy: { displayOrder: "asc" }, select: { id: true, name: true } });
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">New product</h1>
      <p className="mt-2 text-sm text-cocoa">Products start as drafts. Add images and variants on the next screen, then publish.</p>
      <div className="mt-6 max-w-4xl">
        <ActionForm action={createProductAction} submitLabel="Create draft">
          <ProductFields categories={categories} />
        </ActionForm>
      </div>
    </AdminShell>
  );
}
