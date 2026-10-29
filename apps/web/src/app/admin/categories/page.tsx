import { getPrisma } from "@tanvi/database";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/select";
import { saveCategoryAction } from "@/features/catalog/category-actions";
import { requireAdmin } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const auth = await requireAdmin("categories.read");
  const canWrite = auth.permissions.has("categories.write");
  const categories = await getPrisma().category.findMany({ orderBy: { displayOrder: "asc" }, include: { _count: { select: { products: true } } } });
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Categories</h1>
      <p className="mt-2 max-w-prose text-sm text-cocoa">Category names, order and visibility are stored in the database and appear on the storefront and kiosk exactly as set here.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {categories.map((c) => (
          <Card key={c.id}>
            <div className="mb-3 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.imageUrl ? <img src={`/media/${c.imageUrl}/thumb.webp`} alt="" width={64} height={64} className="size-16 rounded-sm object-cover" /> : null}
              <p className="text-sm text-cocoa">{c._count.products} products</p>
            </div>
            {canWrite ? (
              <ActionForm action={saveCategoryAction.bind(null, c.id)} submitLabel="Save category">
                <Field label="Name" name="name" defaultValue={c.name} required />
                <Field label="URL slug" name="slug" defaultValue={c.slug} required />
                <Textarea label="Description" name="description" defaultValue={c.description ?? ""} />
                <Field label="Display order" name="displayOrder" type="number" min={0} defaultValue={c.displayOrder} />
                <Field label="Image (JPEG, PNG or WebP)" name="image" type="file" accept="image/jpeg,image/png,image/webp" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isPublished" defaultChecked={c.isPublished} /> Published
                </label>
              </ActionForm>
            ) : (
              <p>
                {c.name} {c.isPublished ? "" : "(hidden)"}
              </p>
            )}
          </Card>
        ))}
      </div>
      {canWrite ? (
        <section className="mt-10 max-w-md space-y-3">
          <h2 className="text-2xl">Add a category</h2>
          <ActionForm action={saveCategoryAction.bind(null, null)} submitLabel="Create category">
            <Field label="Name" name="name" required />
            <Field label="Display order" name="displayOrder" type="number" min={0} defaultValue={categories.length + 1} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPublished" defaultChecked /> Published
            </label>
          </ActionForm>
        </section>
      ) : null}
    </AdminShell>
  );
}
