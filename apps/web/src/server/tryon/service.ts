import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@tanvi/database";
import { tryOnConfigSchema, type TryOnConfig } from "@tanvi/validation";
import { recordAudit } from "../catalog/audit";
import type { ObjectStorage } from "../storage";
import { processTryOnInput } from "./input";
import { TryOnProviderError, type AiTryOnProvider } from "./provider";

const sha = (v: string): string => createHash("sha256").update(v).digest("hex");
const token = (n = 32): string => randomBytes(n).toString("base64url");
export const PROVIDER_NOT_CONFIGURED = "PROVIDER_NOT_CONFIGURED";

export type Res<T = object> = ({ ok: true } & T) | { ok: false; message: string };

export async function getTryOnConfig(db: Pick<PrismaClient, "setting">): Promise<TryOnConfig> {
  const row = await db.setting.findUnique({ where: { key: "tryon" } });
  const p = tryOnConfigSchema.safeParse(row?.data ?? {});
  return p.success ? p.data : tryOnConfigSchema.parse({});
}

// ---------- kiosk devices ----------

/** The credential is returned ONCE; only its hash is stored. Revoke to disable the device. */
export async function createKioskDevice(prisma: PrismaClient, input: { name: string; location: string | null; actorId: string }): Promise<{ id: string; credential: string }> {
  const credential = `kd_${token(32)}`;
  const d = await prisma.kioskDevice.create({ data: { name: input.name.trim().slice(0, 80), location: input.location?.trim().slice(0, 120) ?? null, tokenHash: sha(credential) } });
  await recordAudit(prisma, { actorId: input.actorId, action: "kiosk.device_created", entityType: "KioskDevice", entityId: d.id });
  return { id: d.id, credential };
}

export async function revokeKioskDevice(prisma: PrismaClient, deviceId: string, actorId: string): Promise<void> {
  await prisma.kioskDevice.update({ where: { id: deviceId }, data: { revokedAt: new Date() } });
  await recordAudit(prisma, { actorId, action: "kiosk.device_revoked", entityType: "KioskDevice", entityId: deviceId });
}

export async function authenticateDevice(prisma: PrismaClient, credential: string) {
  const d = await prisma.kioskDevice.findUnique({ where: { tokenHash: sha(credential) } });
  if (!d || d.revokedAt) return null;
  await prisma.kioskDevice.update({ where: { id: d.id }, data: { lastSeenAt: new Date() } });
  return d;
}

// ---------- sessions ----------

export async function startSession(prisma: PrismaClient, args: { source: "KIOSK" | "WEB"; deviceId?: string; now?: Date }): Promise<{ sessionId: string; token: string }> {
  const cfg = await getTryOnConfig(prisma);
  const now = args.now ?? new Date();
  const t = token();
  const s = await prisma.tryOnSession.create({
    data: {
      source: args.source,
      deviceId: args.deviceId ?? null,
      tokenHash: sha(t),
      expiresAt: new Date(now.getTime() + (args.source === "KIOSK" ? cfg.kioskIdleSeconds * 1000 : cfg.sessionMaxMinutes * 60_000)),
    },
  });
  return { sessionId: s.id, token: t };
}

/** Active, unexpired session for this token. Sliding idle expiry, capped by the absolute session maximum. */
export async function getActiveSession(prisma: PrismaClient, tokenValue: string, now = new Date(), touch = true) {
  const s = await prisma.tryOnSession.findUnique({ where: { tokenHash: sha(tokenValue) } });
  if (!s || s.status !== "ACTIVE" || s.expiresAt <= now) return null;
  if (touch) {
    const cfg = await getTryOnConfig(prisma);
    const idle = s.source === "KIOSK" ? cfg.kioskIdleSeconds * 1000 : cfg.sessionMaxMinutes * 60_000;
    const hardCap = s.createdAt.getTime() + cfg.sessionMaxMinutes * 60_000;
    const next = Math.min(now.getTime() + idle, hardCap);
    if (next > s.expiresAt.getTime()) await prisma.tryOnSession.update({ where: { id: s.id }, data: { expiresAt: new Date(next) } });
  }
  return s;
}

/** Notice text comes from the business (Admin → Content). Without it, capture is refused. Version = hash of the text. */
export async function loadConsentNotice(prisma: PrismaClient, locale: "en" | "hi") {
  const row = await prisma.websiteContent.findUnique({ where: { key: `tryon.consent.${locale}` } });
  const data = row?.data as { title?: string; body?: string } | undefined;
  if (!data?.body?.trim()) return null;
  const text = `${data.title ?? ""}\n${data.body}`.trim();
  return { locale, text, version: sha(text).slice(0, 12) };
}

export async function recordCaptureConsent(prisma: PrismaClient, sessionId: string, locale: "en" | "hi"): Promise<Res<{ consentId: string }>> {
  const notice = await loadConsentNotice(prisma, locale);
  if (!notice) return { ok: false, message: "The photo consent notice has not been set up, so photos cannot be taken." };
  const c = await prisma.customerConsent.create({
    data: { purpose: "tryon_image_capture", noticeVersion: notice.version, locale, noticeText: notice.text, tryOnSessionId: sessionId },
  });
  await prisma.tryOnSession.update({ where: { id: sessionId }, data: { consentId: c.id } });
  return { ok: true, consentId: c.id };
}

const inputKey = (sessionId: string): string => `tryon/${sessionId}/input.jpg`;
const resultKey = (sessionId: string, jobId: string): string => `tryon/${sessionId}/result-${jobId}.jpg`;

export async function storeCapture(prisma: PrismaClient, storage: ObjectStorage, sessionId: string, raw: Buffer): Promise<Res> {
  const s = await prisma.tryOnSession.findUnique({ where: { id: sessionId } });
  if (!s || s.status !== "ACTIVE") return { ok: false, message: "This session has ended." };
  if (!s.consentId) return { ok: false, message: "Consent is required before a photo can be taken." };
  const img = await processTryOnInput(raw);
  if (!img.ok) return img;
  await storage.put(inputKey(sessionId), img.image, "image/jpeg");
  await prisma.tryOnSession.update({ where: { id: sessionId }, data: { inputKey: inputKey(sessionId) } });
  return { ok: true };
}

// ---------- jobs ----------

export interface SubmitArgs {
  sessionId: string;
  productId: string;
  idempotencyKey: string;
  provider: AiTryOnProvider | null;
  /** Approved garment image bytes. Resolved by the caller from the product's approved try-on asset. */
  loadGarmentImage: (productId: string) => Promise<Buffer | null>;
  now?: Date;
}

/**
 * Creates and runs a try-on job. Never fabricates a result: without a configured provider the job FAILS with
 * PROVIDER_NOT_CONFIGURED, and that is what the customer is told.
 */
export async function submitTryOn(prisma: PrismaClient, storage: ObjectStorage, a: SubmitArgs): Promise<Res<{ jobId: string; status: string }>> {
  const now = a.now ?? new Date();
  const dup = await prisma.tryOnJob.findUnique({ where: { idempotencyKey: a.idempotencyKey } });
  if (dup) return dup.sessionId === a.sessionId ? { ok: true, jobId: dup.id, status: dup.status } : { ok: false, message: "Invalid request." };

  const session = await prisma.tryOnSession.findUnique({ where: { id: a.sessionId } });
  if (!session || session.status !== "ACTIVE" || session.expiresAt <= now) return { ok: false, message: "This session has ended. Please start again." };
  if (!session.consentId) return { ok: false, message: "Consent is required before trying a garment." };
  if (!session.inputKey) return { ok: false, message: "Please take a photo first." };

  const product = await prisma.product.findFirst({ where: { id: a.productId, status: "PUBLISHED", tryOnEligible: true, category: { isPublished: true } } });
  if (!product) return { ok: false, message: "This garment isn't available for try-on." };

  const cfg = await getTryOnConfig(prisma);
  if ((await prisma.tryOnJob.count({ where: { sessionId: a.sessionId } })) >= cfg.maxJobsPerSession) return { ok: false, message: "You've reached the try-on limit for this visit." };
  const startOfDay = new Date(new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10) + "T00:00:00+05:30");
  if ((await prisma.tryOnJob.count({ where: { createdAt: { gte: startOfDay } } })) >= cfg.maxJobsPerDay) return { ok: false, message: "Try-on is unavailable for today. Please try again tomorrow." };

  const job = await prisma.tryOnJob.create({ data: { sessionId: a.sessionId, productId: a.productId, idempotencyKey: a.idempotencyKey, status: "VALIDATING" } });
  const fail = async (code: string, message: string): Promise<Res<{ jobId: string; status: string }>> => {
    await prisma.tryOnJob.update({ where: { id: job.id }, data: { status: "FAILED", errorCode: code, finishedAt: new Date() } });
    return { ok: false, message };
  };

  if (!a.provider) return fail(PROVIDER_NOT_CONFIGURED, "Virtual try-on isn't available right now.");
  const [person, garment] = await Promise.all([storage.get(session.inputKey), a.loadGarmentImage(a.productId)]);
  if (!person) return fail("INPUT_MISSING", "Your photo is no longer available. Please take it again.");
  if (!garment) return fail("GARMENT_IMAGE_MISSING", "This garment isn't ready for try-on.");

  await prisma.tryOnJob.update({ where: { id: job.id }, data: { status: "QUEUED" } });
  try {
    // One attempt only: inference requests are not blindly retried (SPEC §14).
    const out = await a.provider.submit({ personImage: person.body, garmentImage: garment, idempotencyKey: a.idempotencyKey });
    if (out.kind === "succeeded") {
      const key = resultKey(a.sessionId, job.id);
      await storage.put(key, out.resultImage, "image/jpeg");
      await prisma.tryOnJob.update({ where: { id: job.id }, data: { status: "SUCCEEDED", resultKey: key, costPaise: out.costPaise, finishedAt: new Date() } });
      return { ok: true, jobId: job.id, status: "SUCCEEDED" };
    }
    await prisma.tryOnJob.update({ where: { id: job.id }, data: { status: "PROCESSING", providerJobId: out.providerJobId } });
    return { ok: true, jobId: job.id, status: "PROCESSING" };
  } catch (e) {
    return fail(e instanceof TryOnProviderError ? e.code.slice(0, 40) : "PROVIDER_ERROR", "We couldn't create your look this time. Please try again.");
  }
}

/** Jobs are only visible to the session that created them. */
export async function getJobForSession(prisma: PrismaClient, sessionId: string, jobId: string) {
  const j = await prisma.tryOnJob.findUnique({ where: { id: jobId } });
  return j && j.sessionId === sessionId ? j : null;
}

// ---------- cleanup ----------

async function deleteSessionAssets(prisma: PrismaClient, storage: ObjectStorage, sessionId: string): Promise<void> {
  await storage.deletePrefix(`tryon/${sessionId}`);
  await prisma.tryOnJob.updateMany({ where: { sessionId, resultKey: { not: null } }, data: { resultKey: null } });
  await prisma.tryOnJob.updateMany({ where: { sessionId, status: { in: ["CREATED", "VALIDATING", "QUEUED", "PROCESSING"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
  await prisma.tryOnSession.update({ where: { id: sessionId }, data: { inputKey: null, assetsDeletedAt: new Date() } });
}

export async function endSession(prisma: PrismaClient, storage: ObjectStorage, sessionId: string): Promise<void> {
  await prisma.tryOnSession.updateMany({ where: { id: sessionId, status: "ACTIVE" }, data: { status: "ENDED", endedAt: new Date() } });
  await deleteSessionAssets(prisma, storage, sessionId);
}

/** Backstop that also covers refreshes, dropped networks and kiosk crashes: runs from a scheduler. */
export async function sweepTryOn(prisma: PrismaClient, storage: ObjectStorage, now = new Date()): Promise<{ expired: number; cleaned: number }> {
  const stale = await prisma.tryOnSession.findMany({ where: { status: "ACTIVE", expiresAt: { lte: now } }, select: { id: true }, take: 500 });
  for (const s of stale) await prisma.tryOnSession.update({ where: { id: s.id }, data: { status: "EXPIRED", endedAt: now } });
  const dirty = await prisma.tryOnSession.findMany({ where: { status: { in: ["ENDED", "EXPIRED"] }, assetsDeletedAt: null }, select: { id: true }, take: 500 });
  for (const s of dirty) await deleteSessionAssets(prisma, storage, s.id);
  await prisma.continuationLink.deleteMany({ where: { expiresAt: { lte: now } } });
  return { expired: stale.length, cleaned: dirty.length };
}

// ---------- QR continuation ----------

/** The QR code carries only an opaque token that opens one product page. No image, no personal data, no internal ids. */
export async function createContinuation(prisma: PrismaClient, sessionId: string, productId: string, now = new Date()): Promise<Res<{ token: string }>> {
  const cfg = await getTryOnConfig(prisma);
  const p = await prisma.product.findFirst({ where: { id: productId, status: "PUBLISHED", category: { isPublished: true } }, select: { id: true } });
  if (!p) return { ok: false, message: "That product isn't available." };
  const t = token(24);
  await prisma.continuationLink.create({ data: { sessionId, productId, tokenHash: sha(t), expiresAt: new Date(now.getTime() + cfg.continuationMinutes * 60_000) } });
  return { ok: true, token: t };
}

export async function resolveContinuation(prisma: PrismaClient, tokenValue: string, now = new Date()): Promise<string | null> {
  const l = await prisma.continuationLink.findUnique({ where: { tokenHash: sha(tokenValue) } });
  if (!l || l.expiresAt <= now) return null;
  const p = await prisma.product.findFirst({ where: { id: l.productId, status: "PUBLISHED", category: { isPublished: true } }, select: { slug: true } });
  return p?.slug ?? null;
}
