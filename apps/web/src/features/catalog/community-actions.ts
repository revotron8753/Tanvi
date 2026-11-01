"use server";

import { getPrisma } from "@tanvi/database";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { requirePermissionForAction } from "@/server/auth/guard";
import { recordAudit } from "@/server/catalog/audit";
import { processProductImage, RENDITIONS } from "@/server/catalog/images";
import { journalInputSchema, moderateReview, saveJournalPost } from "@/server/community/service";
import { getStorage } from "@/server/storage/instance";

export async function saveJournalAction(postId: string | null, _p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("content.write");
  const parsed = journalInputSchema.safeParse({
    title: form.get("title"),
    slug: form.get("slug") ?? undefined,
    excerpt: form.get("excerpt") ?? undefined,
    body: form.get("body"),
    imageAlt: form.get("imageAlt") ?? undefined,
    published: form.get("published") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fields." };
  const prisma = getPrisma();
  const id = postId ? z.string().uuid().parse(postId) : null;

  let imageKey: string | null | undefined;
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    const img = await processProductImage(Buffer.from(await file.arrayBuffer()));
    if (!img.ok) return { error: img.message };
    imageKey = `journal/${crypto.randomUUID()}`;
    for (const r of RENDITIONS) await getStorage().put(`${imageKey}/${r.name}.webp`, img.renditions[r.name], "image/webp");
  } else if (form.get("removeImage") === "on") {
    imageKey = null;
  }

  const res = await saveJournalPost(prisma, id, parsed.data, imageKey);
  if (!res.ok) return { error: res.message };
  await recordAudit(prisma, { actorId: actor.user.id, action: id ? "journal.updated" : "journal.created", entityType: "JournalPost", entityId: res.id });
  revalidatePath("/", "layout");
  return { ok: id ? "Saved." : "Post created." };
}

export async function moderateReviewAction(reviewId: string, status: "APPROVED" | "REJECTED" | "PENDING", form: FormData): Promise<void> {
  void form;
  const actor = await requirePermissionForAction("content.write");
  const id = z.string().uuid().parse(reviewId);
  const prisma = getPrisma();
  if (await moderateReview(prisma, id, status, actor.user.id)) {
    await recordAudit(prisma, { actorId: actor.user.id, action: `review.${status.toLowerCase()}`, entityType: "Review", entityId: id });
  }
  revalidatePath("/", "layout");
}
