import type { PrismaClient } from "@tanvi/database";
import type { ObjectStorage } from "../storage";
import { recordAudit } from "./audit";
import { processProductImage, RENDITIONS } from "./images";
import type { Result } from "./products";
import { slugify } from "./slug";

export interface CategoryFields {
  name: string;
  slug: string;
  description: string | null;
  displayOrder: number;
  isPublished: boolean;
}

function check(f: CategoryFields): string | null {
  if (f.name.trim().length < 2) return "Enter a category name.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug)) return "The slug may only contain lowercase letters, numbers and dashes.";
  if (!Number.isInteger(f.displayOrder) || f.displayOrder < 0 || f.displayOrder > 9999) return "Display order must be a whole number.";
  return null;
}

const isUnique = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

export async function createCategory(prisma: PrismaClient, input: Omit<CategoryFields, "slug"> & { slug?: string }, actorId: string): Promise<Result<{ id: string }>> {
  const fields = { ...input, slug: input.slug || slugify(input.name) };
  const problem = check(fields);
  if (problem) return { ok: false, message: problem };
  try {
    const c = await prisma.category.create({ data: fields });
    await recordAudit(prisma, { actorId, action: "category.created", entityType: "Category", entityId: c.id });
    return { ok: true, id: c.id };
  } catch (e) {
    if (isUnique(e)) return { ok: false, message: "A category with that slug already exists." };
    throw e;
  }
}

export async function updateCategory(prisma: PrismaClient, id: string, fields: CategoryFields, actorId: string): Promise<Result> {
  const problem = check(fields);
  if (problem) return { ok: false, message: problem };
  try {
    await prisma.category.update({ where: { id }, data: fields });
    await recordAudit(prisma, { actorId, action: "category.updated", entityType: "Category", entityId: id });
    return { ok: true };
  } catch (e) {
    if (isUnique(e)) return { ok: false, message: "A category with that slug already exists." };
    throw e;
  }
}

export async function setCategoryImage(prisma: PrismaClient, storage: ObjectStorage, id: string, file: Buffer, actorId: string): Promise<Result> {
  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat) return { ok: false, message: "Category not found." };
  const processed = await processProductImage(file);
  if (!processed.ok) return processed;
  const base = `categories/${id}`;
  for (const r of RENDITIONS) await storage.put(`${base}/${r.name}.webp`, processed.renditions[r.name], "image/webp");
  await prisma.category.update({ where: { id }, data: { imageUrl: base } });
  await recordAudit(prisma, { actorId, action: "category.image_set", entityType: "Category", entityId: id });
  return { ok: true };
}
