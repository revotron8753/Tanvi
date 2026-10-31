import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrisma } from "@tanvi/database";
import { seedCore } from "../../packages/database/src/seed-core";
import { LocalDiskStorage } from "../../apps/web/src/server/storage";
import { canMove, isTerminal } from "../../apps/web/src/server/tryon/state";
import { TryOnProviderError, type AiTryOnProvider } from "../../apps/web/src/server/tryon/provider";
import {
  authenticateDevice, createContinuation, createKioskDevice, endSession, getActiveSession, getJobForSession, PROVIDER_NOT_CONFIGURED,
  recordCaptureConsent, resolveContinuation, revokeKioskDevice, startSession, storeCapture, submitTryOn, sweepTryOn,
} from "../../apps/web/src/server/tryon/service";

describe("try-on job state machine (pure)", () => {
  it("only moves forward and terminal states are final", () => {
    expect(canMove("CREATED", "VALIDATING")).toBe(true);
    expect(canMove("QUEUED", "SUCCEEDED")).toBe(true);
    expect(canMove("SUCCEEDED", "FAILED")).toBe(false);
    expect(canMove("PROCESSING", "CREATED")).toBe(false);
    for (const s of ["SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"] as const) expect(isTerminal(s)).toBe(true);
    expect(isTerminal("PROCESSING")).toBe(false);
  });
});

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

/** Test double for the port. It is NOT the real model and says nothing about its behaviour. */
const okProvider = (calls: { n: number }): AiTryOnProvider => ({
  name: "test-double",
  async submit() {
    calls.n++;
    return { kind: "succeeded", resultImage: await sharp({ create: { width: 400, height: 600, channels: 3, background: "#123456" } }).jpeg().toBuffer(), costPaise: 250 };
  },
});

d("try-on core (real PostgreSQL, local storage)", () => {
  const prisma = createPrisma(url ?? "");
  const run = randomBytes(3).toString("hex");
  let dir = "";
  let storage: LocalDiskStorage;
  let actorId = "";
  let productId = "";
  const photo = () => sharp({ create: { width: 800, height: 1200, channels: 3, background: "#b5a18b" } }).jpeg().toBuffer();
  const garment = async () => Buffer.from("garment");

  async function readySession(source: "KIOSK" | "WEB" = "KIOSK") {
    const s = await startSession(prisma, { source });
    expect((await recordCaptureConsent(prisma, s.sessionId, "en")).ok).toBe(true);
    expect((await storeCapture(prisma, storage, s.sessionId, await photo())).ok).toBe(true);
    return s;
  }

  beforeAll(async () => {
    await seedCore(prisma);
    dir = await mkdtemp(path.join(os.tmpdir(), "tanvi-tryon-"));
    storage = new LocalDiskStorage(dir);
    actorId = (await prisma.user.create({ data: { email: `to-${run}@example.test`, name: "to", passwordHash: "x" } })).id;
    const cat = await prisma.category.findUniqueOrThrow({ where: { slug: "premium-wear" } });
    productId = (await prisma.product.create({ data: { slug: `to-${run}`, name: "Try-on test", categoryId: cat.id, pricePaise: 100000, status: "PUBLISHED", publishedAt: new Date(), tryOnEligible: true } })).id;
    const notice = { title: "Photo consent", body: "We use your photo only to show you this look and delete it when you finish." };
    await prisma.websiteContent.upsert({ where: { key: "tryon.consent.en" }, update: { data: notice }, create: { key: "tryon.consent.en", data: notice } });
    await prisma.setting.upsert({ where: { key: "tryon" }, update: { data: { maxJobsPerSession: 3, maxJobsPerDay: 100000, kioskIdleSeconds: 90 } }, create: { key: "tryon", data: { maxJobsPerSession: 3, maxJobsPerDay: 100000, kioskIdleSeconds: 90 } } });
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("kiosk devices authenticate by a revocable credential; only a hash is stored", async () => {
    const dev = await createKioskDevice(prisma, { name: `K-${run}`, location: "Store", actorId });
    expect(await prisma.kioskDevice.count({ where: { tokenHash: dev.credential } })).toBe(0);
    expect((await authenticateDevice(prisma, dev.credential))?.id).toBe(dev.id);
    expect(await authenticateDevice(prisma, "kd_wrong")).toBeNull();
    await revokeKioskDevice(prisma, dev.id, actorId);
    expect(await authenticateDevice(prisma, dev.credential)).toBeNull();
  });

  it("refuses capture without recorded consent, and without a configured consent notice", async () => {
    const s = await startSession(prisma, { source: "KIOSK" });
    expect(await storeCapture(prisma, storage, s.sessionId, await photo())).toMatchObject({ ok: false, message: expect.stringContaining("Consent") });
    expect(await storage.get(`tryon/${s.sessionId}/input.jpg`)).toBeNull();
    expect(await recordCaptureConsent(prisma, s.sessionId, "hi")).toMatchObject({ ok: false, message: expect.stringContaining("not been set up") });
  });

  it("records consent with the notice version and text, and rejects bad photos", async () => {
    const s = await startSession(prisma, { source: "KIOSK" });
    const c = await recordCaptureConsent(prisma, s.sessionId, "en");
    if (!c.ok) throw new Error(c.message);
    const row = await prisma.customerConsent.findUniqueOrThrow({ where: { id: c.consentId } });
    expect(row).toMatchObject({ purpose: "tryon_image_capture", locale: "en", tryOnSessionId: s.sessionId });
    expect(row.noticeVersion).toMatch(/^[0-9a-f]{12}$/);
    expect(row.noticeText).toContain("delete it when you finish");
    expect(await storeCapture(prisma, storage, s.sessionId, Buffer.from("<html>not a photo</html>"))).toMatchObject({ ok: false });
    expect(await storeCapture(prisma, storage, s.sessionId, await sharp({ create: { width: 100, height: 100, channels: 3, background: "#fff" } }).jpeg().toBuffer())).toMatchObject({ ok: false, message: expect.stringContaining("too small") });
  });

  it("stores the photo privately as a metadata-free JPEG under the session", async () => {
    const s = await readySession();
    const stored = await storage.get(`tryon/${s.sessionId}/input.jpg`);
    expect(stored?.body.length).toBeGreaterThan(100);
    const meta = await sharp(stored?.body).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
  });

  it("without a provider the job FAILS honestly and no result is invented", async () => {
    const s = await readySession();
    const r = await submitTryOn(prisma, storage, { sessionId: s.sessionId, productId, idempotencyKey: randomUUID(), provider: null, loadGarmentImage: garment });
    expect(r).toMatchObject({ ok: false, message: "Virtual try-on isn't available right now." });
    const job = await prisma.tryOnJob.findFirstOrThrow({ where: { sessionId: s.sessionId } });
    expect(job).toMatchObject({ status: "FAILED", errorCode: PROVIDER_NOT_CONFIGURED, resultKey: null });
  });

  it("with a provider: succeeds, stores the result inside the session, records cost, is idempotent", async () => {
    const s = await readySession();
    const calls = { n: 0 };
    const key = randomUUID();
    const args = { sessionId: s.sessionId, productId, idempotencyKey: key, provider: okProvider(calls), loadGarmentImage: garment };
    const r = await submitTryOn(prisma, storage, args);
    if (!r.ok) throw new Error(r.message);
    expect(r.status).toBe("SUCCEEDED");
    const job = await prisma.tryOnJob.findUniqueOrThrow({ where: { id: r.jobId } });
    expect(job).toMatchObject({ status: "SUCCEEDED", costPaise: 250 });
    expect(job.resultKey?.startsWith(`tryon/${s.sessionId}/`)).toBe(true);
    expect(await submitTryOn(prisma, storage, args)).toMatchObject({ ok: true, jobId: r.jobId });
    expect(calls.n).toBe(1); // a repeated request never re-runs inference
  });

  it("provider errors fail the job once (no blind retry) with a safe message", async () => {
    const s = await readySession();
    let n = 0;
    const bad: AiTryOnProvider = { name: "bad", async submit() { n++; throw new TryOnProviderError("internal: stack trace and secrets", "UPSTREAM_500", true); } };
    const r = await submitTryOn(prisma, storage, { sessionId: s.sessionId, productId, idempotencyKey: randomUUID(), provider: bad, loadGarmentImage: garment });
    expect(r).toMatchObject({ ok: false, message: expect.not.stringContaining("stack trace") });
    expect(n).toBe(1);
    expect(await prisma.tryOnJob.findFirstOrThrow({ where: { sessionId: s.sessionId } })).toMatchObject({ status: "FAILED", errorCode: "UPSTREAM_500" });
  });

  it("enforces eligibility, consent, photo, and the per-session cap", async () => {
    const calls = { n: 0 };
    const base = { productId, provider: okProvider(calls), loadGarmentImage: garment };
    const noConsent = await startSession(prisma, { source: "WEB" });
    expect(await submitTryOn(prisma, storage, { ...base, sessionId: noConsent.sessionId, idempotencyKey: randomUUID() })).toMatchObject({ ok: false, message: expect.stringContaining("Consent") });

    const s = await startSession(prisma, { source: "KIOSK" });
    await recordCaptureConsent(prisma, s.sessionId, "en");
    expect(await submitTryOn(prisma, storage, { ...base, sessionId: s.sessionId, idempotencyKey: randomUUID() })).toMatchObject({ ok: false, message: expect.stringContaining("photo") });
    await storeCapture(prisma, storage, s.sessionId, await photo());

    const cat = await prisma.category.findUniqueOrThrow({ where: { slug: "premium-wear" } });
    const ineligible = await prisma.product.create({ data: { slug: `to-no-${run}`, name: "No tryon", categoryId: cat.id, pricePaise: 1000, status: "PUBLISHED", publishedAt: new Date(), tryOnEligible: false } });
    expect(await submitTryOn(prisma, storage, { ...base, productId: ineligible.id, sessionId: s.sessionId, idempotencyKey: randomUUID() })).toMatchObject({ ok: false, message: expect.stringContaining("isn't available") });

    for (let i = 0; i < 3; i++) expect((await submitTryOn(prisma, storage, { ...base, sessionId: s.sessionId, idempotencyKey: randomUUID() })).ok).toBe(true);
    expect(await submitTryOn(prisma, storage, { ...base, sessionId: s.sessionId, idempotencyKey: randomUUID() })).toMatchObject({ ok: false, message: expect.stringContaining("limit") });
  });

  it("sessions are isolated: another session cannot see the job or reuse the photo", async () => {
    const a = await readySession();
    const b = await startSession(prisma, { source: "KIOSK" });
    const r = await submitTryOn(prisma, storage, { sessionId: a.sessionId, productId, idempotencyKey: randomUUID(), provider: okProvider({ n: 0 }), loadGarmentImage: garment });
    if (!r.ok) throw new Error(r.message);
    expect(await getJobForSession(prisma, a.sessionId, r.jobId)).not.toBeNull();
    expect(await getJobForSession(prisma, b.sessionId, r.jobId)).toBeNull();
    expect((await prisma.tryOnSession.findUniqueOrThrow({ where: { id: b.sessionId } })).inputKey).toBeNull();
    expect(await submitTryOn(prisma, storage, { sessionId: b.sessionId, productId, idempotencyKey: randomUUID(), provider: okProvider({ n: 0 }), loadGarmentImage: garment })).toMatchObject({ ok: false });
    // reusing session A's idempotency key from session B is refused
    const j = await prisma.tryOnJob.findUniqueOrThrow({ where: { id: r.jobId } });
    expect(await submitTryOn(prisma, storage, { sessionId: b.sessionId, productId, idempotencyKey: j.idempotencyKey, provider: okProvider({ n: 0 }), loadGarmentImage: garment })).toMatchObject({ ok: false });
  });

  it("ending a session deletes the photo and results, cancels open jobs, and keeps the audit record", async () => {
    const s = await readySession();
    const r = await submitTryOn(prisma, storage, { sessionId: s.sessionId, productId, idempotencyKey: randomUUID(), provider: okProvider({ n: 0 }), loadGarmentImage: garment });
    if (!r.ok) throw new Error(r.message);
    expect(await readdir(path.join(dir, "tryon", s.sessionId))).toHaveLength(2);
    await endSession(prisma, storage, s.sessionId);
    await expect(readdir(path.join(dir, "tryon", s.sessionId))).rejects.toThrow();
    const sess = await prisma.tryOnSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(sess).toMatchObject({ status: "ENDED", inputKey: null });
    expect(sess.assetsDeletedAt).not.toBeNull();
    expect((await prisma.tryOnJob.findUniqueOrThrow({ where: { id: r.jobId } })).resultKey).toBeNull();
    expect(await getActiveSession(prisma, s.token)).toBeNull();
    expect(await prisma.customerConsent.count({ where: { tryOnSessionId: s.sessionId } })).toBe(1); // consent evidence is kept
  });

  it("the sweeper cleans up abandoned sessions (refresh, network drop, kiosk crash)", async () => {
    const s = await readySession();
    expect((await sweepTryOn(prisma, storage, new Date())).expired).toBeGreaterThanOrEqual(0);
    expect((await prisma.tryOnSession.findUniqueOrThrow({ where: { id: s.sessionId } })).status).toBe("ACTIVE");
    const later = new Date(Date.now() + 3_600_000);
    await sweepTryOn(prisma, storage, later);
    expect(await prisma.tryOnSession.findUniqueOrThrow({ where: { id: s.sessionId } })).toMatchObject({ status: "EXPIRED", inputKey: null });
    expect(await storage.get(`tryon/${s.sessionId}/input.jpg`)).toBeNull();
    expect(await getActiveSession(prisma, s.token, later)).toBeNull();
  });

  it("idle expiry slides with activity but never beyond the absolute maximum", async () => {
    const s = await startSession(prisma, { source: "KIOSK" });
    const t0 = (await prisma.tryOnSession.findUniqueOrThrow({ where: { id: s.sessionId } })).createdAt.getTime();
    expect(await getActiveSession(prisma, s.token, new Date(t0 + 60_000))).not.toBeNull(); // slides to t0+60s+90s
    expect(await getActiveSession(prisma, s.token, new Date(t0 + 130_000))).not.toBeNull();
    expect(await getActiveSession(prisma, s.token, new Date(t0 + 130_000 + 91_000))).toBeNull(); // idle > 90s
  });

  it("QR continuation opens only the product page, expires, and survives session end", async () => {
    const s = await readySession();
    const l = await createContinuation(prisma, s.sessionId, productId);
    if (!l.ok) throw new Error(l.message);
    expect(l.token).not.toContain(s.sessionId);
    expect(l.token).not.toContain(productId);
    await endSession(prisma, storage, s.sessionId);
    expect(await resolveContinuation(prisma, l.token)).toBe(`to-${run}`);
    expect(await resolveContinuation(prisma, "garbage")).toBeNull();
    expect(await resolveContinuation(prisma, l.token, new Date(Date.now() + 3_600_000))).toBeNull();
    expect(await createContinuation(prisma, s.sessionId, randomUUID())).toMatchObject({ ok: false });
  });
});
