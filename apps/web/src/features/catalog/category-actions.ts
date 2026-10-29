"use server";

import { getPrisma } from "@tanvi/database";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { requirePermissionForAction } from "@/server/auth/guard";
import { createCategory, setCategoryImage, updateCategory } from "@/server/catalog/categories";
import { getStorage } from "@/server/storage/instance";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveCategoryAction(categoryId: string | null, _p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("categories.write");
  const fields = {
    name: str(form, "name"),
    slug: str(form, "slug"),
    description: str(form, "description") || null,
    displayOrder: Number(str(form, "displayOrder") || "0"),
    isPublished: form.get("isPublished") === "on",
  };
  const prisma = getPrisma();
  let id: string;
  if (categoryId) {
    id = z.string().uuid().parse(categoryId);
    const res = await updateCategory(prisma, id, fields, actor.user.id);
    if (!res.ok) return { error: res.message };
  } else {
    const res = await createCategory(prisma, fields, actor.user.id);
    if (!res.ok) return { error: res.message };
    id = res.id;
  }
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    const img = await setCategoryImage(prisma, getStorage(), id, Buffer.from(await file.arrayBuffer()), actor.user.id);
    if (!img.ok) return { error: `Saved, but the image was rejected: ${img.message}` };
  }
  revalidatePath("/admin/categories");
  return { ok: categoryId ? "Saved." : "Category created." };
}
