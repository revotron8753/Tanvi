import { getPrisma } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import {
  addVariantAction,
  imageAltAction,
  imageDeleteAction,
  imageMoveAction,
  imagePrimaryAction,
  productTransitionAction,
  removeVariantAction,
  updateProductAction,
  updateVariantAction,
  uploadImageAction,
} from "@/features/catalog/actions";
import { uploadGarmentAction } from "@/features/tryon/admin-actions";
import { ProductFields } from "@/features/catalog/product-fields";
import { requireAdmin } from "@/server/auth/guard";
import { checkPublishable } from "@/server/catalog/products";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("products.read");
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const prisma = getPrisma();
  const product = await prisma.product.findUnique({
    where: { id: id.data },
    include: { images: { orderBy: { position: "asc" } }, variants: { orderBy: [{ size: "asc" }, { colour: "asc" }], include: { balances: true } } },
  });
  if (!product) notFound();
  const categories = await prisma.category.findMany({ orderBy: { displayOrder: "asc" }, select: { id: true, name: true } });
  const canWrite = auth.permissions.has("products.write");
  const canPublish = auth.permissions.has("products.publish");
  const problems = product.status === "PUBLISHED" ? [] : await checkPublishable(prisma, product.id);
  const transition = (kind: "publish" | "unpublish" | "archive" | "duplicate") => productTransitionAction.bind(null, product.id, kind);

  return (
    <AdminShell auth={auth}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">{product.name}</h1>
          <p className="mt-1 text-sm text-cocoa">
            {product.status.charAt(0) + product.status.slice(1).toLowerCase()} · /products/{product.slug}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPublish && product.status !== "PUBLISHED" && product.status !== "ARCHIVED" ? (
            <ActionForm action={transition("publish")} submitLabel="Publish" pendingLabel="Publishing…" className="space-y-2" />
          ) : null}
          {canPublish && product.status === "PUBLISHED" ? <ActionForm action={transition("unpublish")} submitLabel="Unpublish" variant="secondary" className="space-y-2" /> : null}
          {canWrite ? <ActionForm action={transition("duplicate")} submitLabel="Duplicate" variant="secondary" className="space-y-2" /> : null}
          {canWrite && product.status !== "ARCHIVED" ? <ActionForm action={transition("archive")} submitLabel="Archive" variant="ghost" className="space-y-2" /> : null}
        </div>
      </div>
      {problems.length > 0 && product.status === "DRAFT" ? (
        <div className="mt-4 rounded-sm border border-cocoa bg-beige p-4 text-sm" role="status">
          <p className="font-medium">Before this can be published:</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="mt-8 space-y-3" aria-labelledby="images-h">
        <h2 id="images-h" className="text-2xl">Images</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {product.images.map((img, i) => (
            <li key={img.id}>
              <Card className="space-y-2 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/media/${img.storageKey}/md.webp`} alt={img.altText} width={400} height={520} className="aspect-[3/4] w-full rounded-sm object-cover" />
                {img.isPrimary ? <p className="text-xs font-medium text-cocoa">Primary image</p> : null}
                {canWrite ? (
                  <>
                    <form action={imageAltAction} className="space-y-1">
                      <input type="hidden" name="imageId" value={img.id} />
                      <input type="hidden" name="productId" value={product.id} />
                      <label className="text-xs" htmlFor={`alt-${img.id}`}>Alt text</label>
                      <input id={`alt-${img.id}`} name="alt" defaultValue={img.altText} className="min-h-10 w-full rounded-sm border border-taupe px-2 text-sm" />
                      <Button type="submit" variant="ghost" className="min-h-9 px-2 text-xs">Save alt text</Button>
                    </form>
                    <div className="flex flex-wrap gap-1">
                      {[["up", "Move earlier", i === 0], ["down", "Move later", i === product.images.length - 1]].map(([dir, label, disabled]) => (
                        <form key={String(dir)} action={imageMoveAction}>
                          <input type="hidden" name="imageId" value={img.id} />
                          <input type="hidden" name="productId" value={product.id} />
                          <input type="hidden" name="dir" value={String(dir)} />
                          <Button type="submit" variant="ghost" className="min-h-9 px-2 text-xs" disabled={Boolean(disabled)}>{String(label)}</Button>
                        </form>
                      ))}
                      {!img.isPrimary ? (
                        <form action={imagePrimaryAction}>
                          <input type="hidden" name="imageId" value={img.id} />
                          <input type="hidden" name="productId" value={product.id} />
                          <Button type="submit" variant="ghost" className="min-h-9 px-2 text-xs">Make primary</Button>
                        </form>
                      ) : null}
                      <form action={imageDeleteAction}>
                        <input type="hidden" name="imageId" value={img.id} />
                        <input type="hidden" name="productId" value={product.id} />
                        <Button type="submit" variant="ghost" className="min-h-9 px-2 text-xs text-danger">Delete</Button>
                      </form>
                    </div>
                  </>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
        {product.images.length === 0 ? <p className="text-sm text-cocoa">No images yet.</p> : null}
        {canWrite ? (
          <div className="max-w-md">
            <ActionForm action={uploadImageAction.bind(null, product.id)} submitLabel="Upload" pendingLabel="Uploading…">
              <Field label="Images (JPEG, PNG or WebP, up to 10 MB each, at least 600px)" name="file" type="file" accept="image/jpeg,image/png,image/webp" multiple required />
              <Field label="Alt text (optional)" name="alt" hint="Describe the garment for screen readers. Leave blank to use the file name; edit afterwards." />
            </ActionForm>
          </div>
        ) : null}
      </section>

      <section className="mt-10 space-y-3" aria-labelledby="variants-h">
        <h2 id="variants-h" className="text-2xl">Variants and stock</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Variants</caption>
            <thead className="border-b border-beige text-cocoa">
              <tr>
                <th scope="col" className="py-2 pr-4">SKU</th>
                <th scope="col" className="py-2 pr-4">Size</th>
                <th scope="col" className="py-2 pr-4">Colour</th>
                <th scope="col" className="py-2 pr-4">Price override</th>
                <th scope="col" className="py-2 pr-4">Available</th>
                <th scope="col" className="py-2 pr-4">Active</th>
                <th scope="col" className="py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => {
                const available = v.balances.reduce((s, b) => s + b.onHand - b.reserved, 0);
                return (
                  <tr key={v.id} className="border-b border-beige align-top">
                    <td className="py-2 pr-4 font-mono text-xs">{v.sku}</td>
                    <td className="py-2 pr-4">{v.size}</td>
                    <td className="py-2 pr-4">{v.colour}</td>
                    <td className="py-2 pr-4" colSpan={canWrite ? 1 : 2}>
                      {canWrite ? (
                        <form action={updateVariantAction} className="flex items-center gap-2">
                          <input type="hidden" name="variantId" value={v.id} />
                          <input type="hidden" name="productId" value={product.id} />
                          <input name="price" aria-label={`Price override for ${v.sku}`} defaultValue={v.pricePaise == null ? "" : String(v.pricePaise / 100)} placeholder={formatPaise(paise(product.pricePaise))} className="min-h-9 w-28 rounded-sm border border-taupe px-2" />
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" name="isActive" defaultChecked={v.isActive} /> Active
                          </label>
                          <Button type="submit" variant="ghost" className="min-h-9 px-2 text-xs">Save</Button>
                        </form>
                      ) : v.pricePaise == null ? "–" : formatPaise(paise(v.pricePaise))}
                    </td>
                    <td className="py-2 pr-4">{available}</td>
                    <td className="py-2 pr-4">{v.isActive ? "Yes" : "No"}</td>
                    <td className="py-2">
                      {canWrite ? (
                        <form action={removeVariantAction}>
                          <input type="hidden" name="variantId" value={v.id} />
                          <input type="hidden" name="productId" value={product.id} />
                          <Button type="submit" variant="ghost" className="min-h-9 px-2 text-xs text-danger">Remove</Button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {canWrite ? (
          <div className="max-w-md">
            <h3 className="mb-2 text-lg">Add a variant</h3>
            <ActionForm action={addVariantAction.bind(null, product.id)} submitLabel="Add variant">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Size" name="size" placeholder="M" required />
                <Field label="Colour" name="colour" placeholder="Rose" required />
              </div>
              <Field label="SKU (optional)" name="sku" hint="Leave blank to generate one." />
              <Field label="Price override (₹, optional)" name="price" inputMode="decimal" />
              <Field label="Opening stock" name="stock" type="number" min={0} defaultValue={0} />
            </ActionForm>
            <p className="mt-2 text-xs text-cocoa">Later stock changes are made on the Inventory page so every change has a reason and a history.</p>
          </div>
        ) : null}
      </section>

      {canWrite && product.tryOnEligible ? (
        <section className="mt-10 max-w-md space-y-3" aria-labelledby="garment-h">
          <h2 id="garment-h" className="text-2xl">Try-on garment image</h2>
          <p className="text-sm text-cocoa">{product.tryOnGarmentKey ? "An approved garment image is set." : "No approved garment image yet. This product will not appear on the try-on screen until you add one."} Use a clear, front-facing image of the garment; the AI provider&apos;s exact requirements are not known yet.</p>
          <ActionForm action={uploadGarmentAction.bind(null, product.id)} submitLabel="Save garment image">
            <Field label="Garment image (JPEG, PNG or WebP)" name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
          </ActionForm>
        </section>
      ) : null}

      {canWrite ? (
        <section className="mt-10 max-w-4xl space-y-3" aria-labelledby="details-h">
          <h2 id="details-h" className="text-2xl">Details</h2>
          <ActionForm action={updateProductAction.bind(null, product.id)} submitLabel="Save details">
            <ProductFields product={product} categories={categories} />
          </ActionForm>
        </section>
      ) : null}
    </AdminShell>
  );
}
