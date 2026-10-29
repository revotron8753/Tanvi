"use server";

import { getPrisma } from "@tanvi/database";
import { CONTENT_KEYS, contentDataSchema, type ContentField } from "@tanvi/validation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { requirePermissionForAction } from "@/server/auth/guard";
import { recordAudit } from "@/server/catalog/audit";
import { processProductImage, RENDITIONS } from "@/server/catalog/images";
import { getStorage } from "@/server/storage/instance";

export async function saveContentAction(key: string, _p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("content.write");
  const def = CONTENT_KEYS.find((k) => k.key === key);
  if (!def) return { error: "Unknown content block." };
  const prisma = getPrisma();
  const existing = await prisma.websiteContent.findUnique({ where: { key } });
  const current = (existing?.data ?? {}) as Record<string, string>;

  const raw: Record<string, string> = {};
  for (const f of def.fields) {
    if (f === "imageKey") continue;
    const v = form.get(f);
    if (typeof v === "string" && v.trim() !== "") raw[f] = v;
  }
  if (def.fields.includes("imageKey" as ContentField) && current.imageKey) raw.imageKey = current.imageKey;
  if (form.get("removeImage") === "on") delete raw.imageKey;

  const file = form.get("image");
  if (def.fields.includes("imageKey" as ContentField) && file instanceof File && file.size > 0) {
    const img = await processProductImage(Buffer.from(await file.arrayBuffer()));
    if (!img.ok) return { error: img.message };
    const base = `content/${key.replace(/[^a-z0-9]+/g, "-")}`;
    for (const r of RENDITIONS) await getStorage().put(`${base}/${r.name}.webp`, img.renditions[r.name], "image/webp");
    raw.imageKey = base;
  }

  const parsed = contentDataSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fields." };
  await prisma.websiteContent.upsert({ where: { key }, update: { data: parsed.data, updatedById: actor.user.id }, create: { key, data: parsed.data, updatedById: actor.user.id } });
  await recordAudit(prisma, { actorId: actor.user.id, action: "content.updated", entityType: "WebsiteContent", entityId: key });
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}
