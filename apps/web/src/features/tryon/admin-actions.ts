"use server";

import { getPrisma } from "@tanvi/database";
import { tryOnConfigSchema } from "@tanvi/validation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { requirePermissionForAction } from "@/server/auth/guard";
import { recordAudit } from "@/server/catalog/audit";
import { createKioskDevice, revokeKioskDevice } from "@/server/tryon/service";
import { processTryOnInput } from "@/server/tryon/input";
import { getStorage } from "@/server/storage/instance";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createDeviceAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("settings.write");
  const name = str(form, "name");
  if (name.length < 2) return { error: "Enter a name for this screen." };
  const d = await createKioskDevice(getPrisma(), { name, location: str(form, "location") || null, actorId: actor.user.id });
  revalidatePath("/admin/try-on-sessions");
  return { ok: `Device created. Enter this code once on the kiosk at /kiosk/activate. It will not be shown again: ${d.credential}` };
}

export async function revokeDeviceAction(form: FormData): Promise<void> {
  const actor = await requirePermissionForAction("settings.write");
  await revokeKioskDevice(getPrisma(), z.string().uuid().parse(form.get("id")), actor.user.id);
  revalidatePath("/admin/try-on-sessions");
}

export async function saveTryOnConfigAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("settings.write");
  const parsed = tryOnConfigSchema.safeParse({
    onlineEnabled: form.get("onlineEnabled") === "on",
    kioskIdleSeconds: Number(str(form, "kioskIdleSeconds")),
    sessionMaxMinutes: Number(str(form, "sessionMaxMinutes")),
    maxJobsPerSession: Number(str(form, "maxJobsPerSession")),
    maxJobsPerDay: Number(str(form, "maxJobsPerDay")),
    continuationMinutes: Number(str(form, "continuationMinutes")),
  });
  if (!parsed.success) return { error: "Check the numbers: " + (parsed.error.issues[0]?.message ?? "invalid") };
  const prisma = getPrisma();
  await prisma.setting.upsert({ where: { key: "tryon" }, update: { data: parsed.data }, create: { key: "tryon", data: parsed.data } });
  await recordAudit(prisma, { actorId: actor.user.id, action: "tryon.config_updated", entityType: "Setting", entityId: "tryon" });
  revalidatePath("/admin/try-on-sessions");
  return { ok: "Saved." };
}

/** Approved garment image used for try-on. Private storage; never served by the public media route. */
export async function uploadGarmentAction(productId: string, _p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("products.write");
  const id = z.string().uuid().parse(productId);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image." };
  const img = await processTryOnInput(Buffer.from(await file.arrayBuffer()));
  if (!img.ok) return { error: img.message };
  const key = `tryon-garments/${id}/garment.jpg`;
  await getStorage().put(key, img.image, "image/jpeg");
  const prisma = getPrisma();
  await prisma.product.update({ where: { id }, data: { tryOnGarmentKey: key } });
  await recordAudit(prisma, { actorId: actor.user.id, action: "product.tryon_garment_set", entityType: "Product", entityId: id });
  revalidatePath(`/admin/products/${id}`);
  return { ok: "Garment image saved. It is stored privately and only sent to the try-on service." };
}
