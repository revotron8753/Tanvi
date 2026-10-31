"use server";

import { getPrisma } from "@tanvi/database";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireDevice, requireKioskSession, clearKioskSessionCookie, setDeviceCookie, setKioskSessionCookie } from "@/server/tryon/kiosk";
import { getAiTryOnProvider } from "@/server/tryon/instance";
import { authenticateDevice, createContinuation, endSession, getTryOnConfig, recordCaptureConsent, startSession, storeCapture, submitTryOn } from "@/server/tryon/service";
import { getStorage } from "@/server/storage/instance";
import type { ActionState } from "@/components/action-form";

const uuid = z.string().uuid();

export async function activateDeviceAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const credential = String(form.get("credential") ?? "").trim();
  if (!credential.startsWith("kd_") || !(await authenticateDevice(getPrisma(), credential))) return { error: "That device code isn't valid or has been revoked." };
  await setDeviceCookie(credential);
  redirect("/kiosk");
}

export async function startKioskSessionAction(): Promise<void> {
  const device = await requireDevice();
  const cfg = await getTryOnConfig(getPrisma());
  const s = await startSession(getPrisma(), { source: "KIOSK", deviceId: device.id });
  await setKioskSessionCookie(s.token, cfg.sessionMaxMinutes * 60);
  redirect("/kiosk");
}

export async function giveConsentAction(form: FormData): Promise<void> {
  const s = await requireKioskSession();
  const locale = form.get("locale") === "hi" ? "hi" : "en";
  const r = await recordCaptureConsent(getPrisma(), s.id, locale);
  redirect(r.ok ? "/kiosk/capture" : "/kiosk?notice=missing");
}

export async function declineAndFinishAction(): Promise<void> {
  const s = await requireKioskSession();
  await endSession(getPrisma(), getStorage(), s.id);
  await clearKioskSessionCookie();
  redirect("/kiosk");
}

export async function uploadCaptureAction(form: FormData): Promise<ActionState> {
  const s = await requireKioskSession();
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "No photo received. Please try again." };
  const r = await storeCapture(getPrisma(), getStorage(), s.id, Buffer.from(await file.arrayBuffer()));
  return r.ok ? { ok: "stored" } : { error: r.message };
}

export async function tryGarmentAction(form: FormData): Promise<void> {
  const s = await requireKioskSession();
  const productId = uuid.parse(form.get("productId"));
  const key = uuid.parse(form.get("idempotencyKey"));
  const storage = getStorage();
  const prisma = getPrisma();
  const res = await submitTryOn(prisma, storage, {
    sessionId: s.id,
    productId,
    idempotencyKey: key,
    provider: getAiTryOnProvider(),
    loadGarmentImage: async (id) => {
      const p = await prisma.product.findUnique({ where: { id }, select: { tryOnGarmentKey: true } });
      return p?.tryOnGarmentKey ? ((await storage.get(p.tryOnGarmentKey))?.body ?? null) : null;
    },
  });
  const job = await prisma.tryOnJob.findUnique({ where: { idempotencyKey: key } });
  redirect(job ? `/kiosk/processing?job=${job.id}` : `/kiosk/processing?error=${encodeURIComponent(res.ok ? "" : res.message)}`);
}

export async function startOverAction(): Promise<void> {
  const s = await requireKioskSession();
  await endSession(getPrisma(), getStorage(), s.id);
  await clearKioskSessionCookie();
  redirect("/kiosk");
}

export async function continueOnPhoneAction(form: FormData): Promise<void> {
  const s = await requireKioskSession();
  const r = await createContinuation(getPrisma(), s.id, uuid.parse(form.get("productId")));
  redirect(r.ok ? `/kiosk/continue?c=${r.token}` : "/kiosk/collections");
}

/** Called by the idle timer and by "Home". Safe to call repeatedly. */
export async function endIdleSessionAction(): Promise<void> {
  const device = await requireDevice();
  const s = await (await import("@/server/tryon/kiosk")).getKioskSession();
  if (s && s.deviceId === device.id) await endSession(getPrisma(), getStorage(), s.id);
  await clearKioskSessionCookie();
}
