"use server";

import { getPrisma } from "@tanvi/database";
import { ORDER_EVENTS, ORDER_VARIABLES, whatsappConfigSchema } from "@tanvi/validation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { requirePermissionForAction } from "@/server/auth/guard";
import { saveWhatsAppConfig } from "@/server/messaging/outbox";

export async function saveWhatsAppConfigAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("settings.write");
  const templates: Record<string, { name: string; language: string; variables: string[] }> = {};
  for (const ev of ORDER_EVENTS) {
    const name = String(form.get(`${ev}.name`) ?? "").trim();
    if (!name) continue;
    templates[ev] = {
      name,
      language: String(form.get(`${ev}.language`) ?? "en").trim() || "en",
      variables: ORDER_VARIABLES.filter((v) => form.get(`${ev}.var.${v}`) === "on"),
    };
  }
  const allowed = String(form.get("allowedNumbers") ?? "").split(/[\s,]+/).map((n) => n.replace(/\D/g, "")).filter(Boolean).map((n) => (n.length === 10 ? `91${n}` : n));
  const parsed = whatsappConfigSchema.safeParse({ testMode: form.get("testMode") === "on", allowedNumbers: allowed, templates });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  await saveWhatsAppConfig(getPrisma(), parsed.data, actor.user.id);
  revalidatePath("/admin/whatsapp");
  return { ok: "Saved." };
}
