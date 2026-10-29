import type { Prisma, PrismaClient } from "@tanvi/database";
import type { ObjectStorage } from "../storage";
import { recordAudit } from "./audit";
import { processProductImage, RENDITIONS } from "./images";
import { setOnHand } from "./inventory";
import { publishProblems } from "./publish";
import { slugify } from "./slug";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

export const DEFAULT_LOCATION_CODE = "MAIN";

export interface ProductFields {
  name: string;
  description: string | null;
  categoryId: string;
  pricePaise: number;
  comparePricePaise: number | null;
  parentCode: string | null;
  hsnCode: string | null;
  fabric: string | null;
  fit: string | null;
  neckline: string | null;
  sleeveLength: string | null;
  garmentLength: string | null;
  pattern: string | null;
  careInstructions: string | null;
  isFeatured: boolean;
  isNewArrival: boolean;
  showOnHomepage: boolean;
  tryOnEligible: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
}

async function uniqueSlug(db: PrismaClient, base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "product";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const hit = await db.product.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!hit || hit.id === excludeId) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

function validateFields(f: ProductFields): string | null {
  if (f.name.trim().length < 2) return "Enter a product name.";
  if (!Number.isSafeInteger(f.pricePaise) || f.pricePaise < 0) return "Enter a valid price.";
  if (f.comparePricePaise !== null && f.comparePricePaise < f.pricePaise) return "The original price must not be lower than the price.";
  return null;
}

const isUniqueViolation = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

export async function createProduct(prisma: PrismaClient, fields: ProductFields, actorId: string): Promise<Result<{ id: string }>> {
  const problem = validateFields(fields);
  if (problem) return { ok: false, message: problem };
  const category = await prisma.category.findUnique({ where: { id: fields.categoryId } });
  if (!category) return { ok: false, message: "Choose a category." };
  try {
    const slug = await uniqueSlug(prisma, fields.name);
    const p = await prisma.product.create({ data: { ...fields, slug, status: "DRAFT" } });
    await recordAudit(prisma, { actorId, action: "product.created", entityType: "Product", entityId: p.id });
    return { ok: true, id: p.id };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, message: "That parent code is already used by another product." };
    throw e;
  }
}

export async function updateProduct(prisma: PrismaClient, id: string, fields: ProductFields, actorId: string, slug?: string): Promise<Result> {
  const problem = validateFields(fields);
  if (problem) return { ok: false, message: problem };
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return { ok: false, message: "Product not found." };
  const category = await prisma.category.findUnique({ where: { id: fields.categoryId } });
  if (!category) return { ok: false, message: "Choose a category." };
  try {
    const nextSlug = slug && slug !== existing.slug ? await uniqueSlug(prisma, slug, id) : existing.slug;
    await prisma.product.update({ where: { id }, data: { ...fields, slug: nextSlug } });
    await recordAudit(prisma, { actorId, action: "product.updated", entityType: "Product", entityId: id });
    return { ok: true };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, message: "That parent code is already used by another product." };
    throw e;
  }
}

export async function checkPublishable(prisma: PrismaClient, id: string): Promise<string[]> {
  const p = await prisma.product.findUnique({
    where: { id },
    include: { category: true, images: true, variants: { where: { isActive: true } } },
  });
  if (!p) return ["Product not found."];
  return publishProblems({
    name: p.name,
    slug: p.slug,
    categoryPublished: p.category.isPublished,
    pricePaise: p.pricePaise,
    imageCount: p.images.length,
    imagesMissingAlt: p.images.filter((i) => i.altText.trim() === "").length,
    activeVariantCount: p.variants.length,
    hsnCode: p.hsnCode,
  });
}

export async function publishProduct(prisma: PrismaClient, id: string, actorId: string): Promise<Result> {
  const problems = await checkPublishable(prisma, id);
  if (problems.length > 0) return { ok: false, message: problems.join(" ") };
  await prisma.product.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  await recordAudit(prisma, { actorId, action: "product.published", entityType: "Product", entityId: id });
  return { ok: true };
}

export async function unpublishProduct(prisma: PrismaClient, id: string, actorId: string): Promise<Result> {
  const n = await prisma.product.updateMany({ where: { id, status: "PUBLISHED" }, data: { status: "DRAFT" } });
  if (n.count === 0) return { ok: false, message: "Only published products can be unpublished." };
  await recordAudit(prisma, { actorId, action: "product.unpublished", entityType: "Product", entityId: id });
  return { ok: true };
}

export async function archiveProduct(prisma: PrismaClient, id: string, actorId: string): Promise<Result> {
  const n = await prisma.product.updateMany({ where: { id, status: { not: "ARCHIVED" } }, data: { status: "ARCHIVED" } });
  if (n.count === 0) return { ok: false, message: "Product not found or already archived." };
  await recordAudit(prisma, { actorId, action: "product.archived", entityType: "Product", entityId: id });
  return { ok: true };
}

/** Copies fields and variants (with zero stock). Images are not copied; the copy is a draft. */
export async function duplicateProduct(prisma: PrismaClient, id: string, actorId: string): Promise<Result<{ id: string }>> {
  const src = await prisma.product.findUnique({ where: { id }, include: { variants: true } });
  if (!src) return { ok: false, message: "Product not found." };
  const { variants } = src;
  const name = `${src.name} (copy)`;
  const slug = await uniqueSlug(prisma, name);
  const copy = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({ data: { ...copyFields(src), name, slug, status: "DRAFT", isFeatured: false, showOnHomepage: false } });
    for (const v of variants) {
      await tx.productVariant.create({
        data: { productId: p.id, sku: `${v.sku}-C${p.id.slice(0, 4).toUpperCase()}`, size: v.size, colour: v.colour, pricePaise: v.pricePaise, isActive: v.isActive },
      });
    }
    return p;
  });
  await recordAudit(prisma, { actorId, action: "product.duplicated", entityType: "Product", entityId: copy.id, metadata: { from: id } });
  return { ok: true, id: copy.id };
}

function copyFields(p: ProductFields): ProductFields {
  return {
    name: p.name, description: p.description, categoryId: p.categoryId, pricePaise: p.pricePaise, comparePricePaise: p.comparePricePaise,
    parentCode: null, hsnCode: p.hsnCode, fabric: p.fabric, fit: p.fit, neckline: p.neckline, sleeveLength: p.sleeveLength,
    garmentLength: p.garmentLength, pattern: p.pattern, careInstructions: p.careInstructions, isFeatured: p.isFeatured,
    isNewArrival: p.isNewArrival, showOnHomepage: p.showOnHomepage, tryOnEligible: p.tryOnEligible, seoTitle: p.seoTitle, seoDescription: p.seoDescription,
  };
}

// ---------- variants ----------

export interface VariantInput {
  size: string;
  colour: string;
  sku: string;
  pricePaise: number | null;
  initialStock?: number;
}

export function defaultSku(productCode: string, size: string, colour: string): string {
  const part = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
  return [part(productCode), part(size), part(colour)].filter(Boolean).join("-");
}

export async function addVariant(prisma: PrismaClient, productId: string, input: VariantInput, actorId: string): Promise<Result<{ id: string }>> {
  const size = input.size.trim();
  const colour = input.colour.trim();
  if (!size || !colour) return { ok: false, message: "Enter a size and a colour." };
  if (input.pricePaise !== null && (!Number.isSafeInteger(input.pricePaise) || input.pricePaise < 0)) return { ok: false, message: "Enter a valid variant price." };
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return { ok: false, message: "Product not found." };
  const explicit = input.sku.trim().toUpperCase();
  let sku = explicit || defaultSku(product.parentCode ?? product.slug, size, colour);
  if (!explicit && (await prisma.productVariant.findUnique({ where: { sku }, select: { id: true } }))) {
    sku = `${sku}-${product.id.slice(0, 6).toUpperCase()}`; // auto-generated SKU taken by another product
  }
  if (!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(sku)) return { ok: false, message: "SKU may contain letters, numbers, dots, dashes and underscores." };
  const location = await prisma.stockLocation.findUnique({ where: { code: DEFAULT_LOCATION_CODE } });
  try {
    const v = await prisma.$transaction(async (tx) => {
      const created = await tx.productVariant.create({ data: { productId, sku, size, colour, pricePaise: input.pricePaise } });
      if (input.initialStock && input.initialStock > 0 && location) {
        const r = await setOnHand(tx, { variantId: created.id, locationId: location.id, target: input.initialStock, reason: "Opening stock", actorId });
        if (!r.ok) throw new Error("stock");
      }
      return created;
    });
    await recordAudit(prisma, { actorId, action: "variant.created", entityType: "ProductVariant", entityId: v.id, metadata: { sku } });
    return { ok: true, id: v.id };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, message: "That SKU, or that size and colour, already exists for this product." };
    throw e;
  }
}

export async function updateVariant(
  prisma: PrismaClient,
  variantId: string,
  patch: { pricePaise: number | null; isActive: boolean },
  actorId: string,
): Promise<Result> {
  if (patch.pricePaise !== null && (!Number.isSafeInteger(patch.pricePaise) || patch.pricePaise < 0)) return { ok: false, message: "Enter a valid variant price." };
  await prisma.productVariant.update({ where: { id: variantId }, data: patch });
  await recordAudit(prisma, { actorId, action: "variant.updated", entityType: "ProductVariant", entityId: variantId });
  return { ok: true };
}

/** Hard-deletes only variants that never had stock activity; otherwise they must be deactivated to keep the ledger. */
export async function removeVariant(prisma: PrismaClient, variantId: string, actorId: string): Promise<Result> {
  const moves = await prisma.inventoryMovement.count({ where: { variantId } });
  if (moves > 0) {
    await prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });
    await recordAudit(prisma, { actorId, action: "variant.deactivated", entityType: "ProductVariant", entityId: variantId });
    return { ok: true };
  }
  await prisma.productVariant.delete({ where: { id: variantId } });
  await recordAudit(prisma, { actorId, action: "variant.deleted", entityType: "ProductVariant", entityId: variantId });
  return { ok: true };
}

// ---------- images ----------

export const MAX_IMAGES_PER_PRODUCT = 12;

export async function addProductImage(
  prisma: PrismaClient,
  storage: ObjectStorage,
  input: { productId: string; file: Buffer; altText: string; actorId: string },
): Promise<Result<{ id: string }>> {
  const product = await prisma.product.findUnique({ where: { id: input.productId }, include: { images: true } });
  if (!product) return { ok: false, message: "Product not found." };
  if (product.images.length >= MAX_IMAGES_PER_PRODUCT) return { ok: false, message: `A product can have at most ${MAX_IMAGES_PER_PRODUCT} images.` };
  const processed = await processProductImage(input.file);
  if (!processed.ok) return processed;

  const row = await prisma.productImage.create({
    data: {
      productId: product.id,
      storageKey: "pending",
      altText: input.altText.trim().slice(0, 200),
      position: product.images.reduce((m, i) => Math.max(m, i.position), -1) + 1,
      isPrimary: false,
      width: processed.width,
      height: processed.height,
    },
  });
  const base = `products/${product.id}/${row.id}`;
  try {
    for (const r of RENDITIONS) await storage.put(`${base}/${r.name}.webp`, processed.renditions[r.name], "image/webp");
  } catch (e) {
    await prisma.productImage.delete({ where: { id: row.id } });
    await storage.deletePrefix(base).catch(() => undefined);
    throw e;
  }
  const noPrimary = !product.images.some((i) => i.isPrimary);
  await prisma.productImage.update({ where: { id: row.id }, data: { storageKey: base, isPrimary: noPrimary } });
  await recordAudit(prisma, { actorId: input.actorId, action: "image.added", entityType: "ProductImage", entityId: row.id });
  return { ok: true, id: row.id };
}

export async function updateImageAlt(prisma: PrismaClient, imageId: string, altText: string, actorId: string): Promise<Result> {
  await prisma.productImage.update({ where: { id: imageId }, data: { altText: altText.trim().slice(0, 200) } });
  await recordAudit(prisma, { actorId, action: "image.alt_updated", entityType: "ProductImage", entityId: imageId });
  return { ok: true };
}

export async function setPrimaryImage(prisma: PrismaClient, imageId: string, actorId: string): Promise<Result> {
  const img = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!img) return { ok: false, message: "Image not found." };
  await prisma.$transaction([
    prisma.productImage.updateMany({ where: { productId: img.productId, isPrimary: true }, data: { isPrimary: false } }),
    prisma.productImage.update({ where: { id: imageId }, data: { isPrimary: true } }),
  ]);
  await recordAudit(prisma, { actorId, action: "image.primary_set", entityType: "ProductImage", entityId: imageId });
  return { ok: true };
}

/** `orderedIds` must be exactly the product's image ids. */
export async function reorderImages(prisma: PrismaClient, productId: string, orderedIds: string[], actorId: string): Promise<Result> {
  const images = await prisma.productImage.findMany({ where: { productId }, select: { id: true } });
  const have = new Set(images.map((i) => i.id));
  if (orderedIds.length !== have.size || !orderedIds.every((id) => have.has(id)) || new Set(orderedIds).size !== orderedIds.length) {
    return { ok: false, message: "The image list is out of date. Reload and try again." };
  }
  await prisma.$transaction(orderedIds.map((id, position) => prisma.productImage.update({ where: { id }, data: { position } })));
  await recordAudit(prisma, { actorId, action: "image.reordered", entityType: "Product", entityId: productId });
  return { ok: true };
}

export async function deleteProductImage(prisma: PrismaClient, storage: ObjectStorage, imageId: string, actorId: string): Promise<Result> {
  const img = await prisma.productImage.findUnique({ where: { id: imageId }, include: { product: true } });
  if (!img) return { ok: false, message: "Image not found." };
  if (img.product.status === "PUBLISHED") {
    const count = await prisma.productImage.count({ where: { productId: img.productId } });
    if (count <= 1) return { ok: false, message: "A published product needs at least one image. Unpublish it first." };
  }
  await prisma.productImage.delete({ where: { id: imageId } });
  await storage.deletePrefix(img.storageKey);
  if (img.isPrimary) {
    const next = await prisma.productImage.findFirst({ where: { productId: img.productId }, orderBy: { position: "asc" } });
    if (next) await prisma.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  await recordAudit(prisma, { actorId, action: "image.deleted", entityType: "ProductImage", entityId: imageId });
  return { ok: true };
}

// ---------- listing ----------

export interface ProductListQuery {
  q?: string | undefined;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED" | undefined;
  categoryId?: string | undefined;
  page: number;
  pageSize: number;
}

export async function listProducts(prisma: PrismaClient, query: ProductListQuery) {
  const where: Prisma.ProductWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { parentCode: { contains: query.q, mode: "insensitive" } },
            { variants: { some: { sku: { contains: query.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [total, items] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { category: { select: { name: true } }, images: { where: { isPrimary: true }, take: 1 }, _count: { select: { variants: true } } },
    }),
  ]);
  return { total, items };
}

export const PRODUCT_CSV_COLUMNS = ["parentCode", "name", "category", "status", "pricePaise", "comparePricePaise", "hsnCode", "fabric", "sku", "size", "colour", "onHand"] as const;
