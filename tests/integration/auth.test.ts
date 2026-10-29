import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrisma } from "@tanvi/database";
import { seedCore } from "../../packages/database/src/seed-core";
import {
  beginMfaEnrolment,
  changePassword,
  confirmMfaEnrolment,
  consumeRateLimit,
  createStaffUser,
  getSessionUser,
  login,
  revokeSession,
  verifyMfaForSession,
  type AuthConfig,
} from "../../apps/web/src/server/auth/service";
import { totpAt } from "../../apps/web/src/server/auth/totp";

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("auth service (real PostgreSQL)", () => {
  const prisma = createPrisma(url ?? "");
  const run = randomBytes(3).toString("hex");
  let clock = new Date();
  const cfg: AuthConfig = {
    idleMinutes: 30,
    absoluteHours: 12,
    encryptionKey: randomBytes(32).toString("base64"),
    hashSecret: "h".repeat(40),
    now: () => clock,
  };
  const req = { ip: `10.0.0.${Math.floor(Math.random() * 200) + 1}`, userAgent: "vitest" };
  const PASSWORD = "a long enough passphrase";

  async function newUser(roleKey: string, tag: string) {
    const email = `${tag}-${run}@example.test`;
    const res = await createStaffUser(prisma, cfg, { actorId: null, email, name: tag, password: PASSWORD, roleKey, mustChangePassword: false });
    if (!res.ok) throw new Error(res.message);
    return { id: res.userId, email };
  }

  beforeAll(async () => {
    await seedCore(prisma);
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } });
    await prisma.$disconnect();
  });

  it("logs in with correct credentials and loads role permissions", async () => {
    const u = await newUser("product_manager", "pm");
    const r = await login(prisma, cfg, { email: u.email, password: PASSWORD }, req);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = await getSessionUser(prisma, cfg, r.token);
    expect(s?.permissions.has("products.write")).toBe(true);
    expect(s?.permissions.has("users.write")).toBe(false);
    expect(s?.permissions.has("orders.write")).toBe(false);
  });

  it("stores only a hash of the session token", async () => {
    const u = await newUser("support_agent", "hash");
    const r = await login(prisma, cfg, { email: u.email, password: PASSWORD }, req);
    if (!r.ok) throw new Error("login failed");
    expect(await prisma.session.count({ where: { tokenHash: r.token } })).toBe(0);
  });

  it("gives the same generic result for unknown email and wrong password", async () => {
    const u = await newUser("support_agent", "generic");
    const a = await login(prisma, cfg, { email: u.email, password: "wrong password here" }, req);
    const b = await login(prisma, cfg, { email: `nobody-${run}@example.test`, password: "wrong password here" }, req);
    expect(a).toEqual({ ok: false, reason: "invalid" });
    expect(b).toEqual({ ok: false, reason: "invalid" });
  });

  it("locks the account after repeated failures, even for the right password", async () => {
    const u = await newUser("support_agent", "lock");
    for (let i = 0; i < 5; i++) await login(prisma, cfg, { email: u.email, password: "bad password!!!" }, { ip: null, userAgent: null });
    const locked = await login(prisma, cfg, { email: u.email, password: PASSWORD }, { ip: null, userAgent: null });
    expect(locked).toEqual({ ok: false, reason: "locked" });
    clock = new Date(clock.getTime() + 16 * 60_000);
    const after = await login(prisma, cfg, { email: u.email, password: PASSWORD }, { ip: null, userAgent: null });
    expect(after.ok).toBe(true);
  });

  it("expires sessions on idle timeout and absolute timeout, and on revoke", async () => {
    const u = await newUser("support_agent", "expiry");
    const base = clock;
    const r = await login(prisma, cfg, { email: u.email, password: PASSWORD }, { ip: null, userAgent: null });
    if (!r.ok) throw new Error("login failed");
    clock = new Date(base.getTime() + 29 * 60_000);
    expect(await getSessionUser(prisma, cfg, r.token)).not.toBeNull(); // slides idle window
    clock = new Date(base.getTime() + 29 * 60_000 + 31 * 60_000);
    expect(await getSessionUser(prisma, cfg, r.token)).toBeNull(); // idle expired

    clock = base;
    const r2 = await login(prisma, cfg, { email: u.email, password: PASSWORD }, { ip: null, userAgent: null });
    if (!r2.ok) throw new Error("login failed");
    for (let m = 20; m <= 12 * 60; m += 20) {
      clock = new Date(base.getTime() + m * 60_000);
      const s = await getSessionUser(prisma, cfg, r2.token);
      if (m < 12 * 60) expect(s).not.toBeNull();
      else expect(s).toBeNull(); // absolute expiry despite activity
    }

    clock = new Date();
    const r3 = await login(prisma, cfg, { email: u.email, password: PASSWORD }, { ip: null, userAgent: null });
    if (!r3.ok) throw new Error("login failed");
    const s3 = await getSessionUser(prisma, cfg, r3.token);
    await revokeSession(prisma, s3?.sessionId ?? "");
    expect(await getSessionUser(prisma, cfg, r3.token)).toBeNull();
  });

  it("rejects deactivated users' existing sessions", async () => {
    const u = await newUser("support_agent", "deact");
    const r = await login(prisma, cfg, { email: u.email, password: PASSWORD }, { ip: null, userAgent: null });
    if (!r.ok) throw new Error("login failed");
    await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
    expect(await getSessionUser(prisma, cfg, r.token)).toBeNull();
    expect((await login(prisma, cfg, { email: u.email, password: PASSWORD }, { ip: null, userAgent: null })).ok).toBe(false);
  });

  it("requires MFA when enabled: session starts unverified, TOTP verifies, replay is rejected", async () => {
    const u = await newUser("store_manager", "mfa");
    const first = await login(prisma, cfg, { email: u.email, password: PASSWORD }, { ip: null, userAgent: null });
    if (!first.ok) throw new Error("login failed");
    const s1 = await getSessionUser(prisma, cfg, first.token);
    const { secret } = await beginMfaEnrolment(prisma, cfg, u.id, u.email);
    expect(await confirmMfaEnrolment(prisma, cfg, { userId: u.id, sessionId: s1?.sessionId ?? "", code: "000000" }, req)).toBeNull();
    clock = new Date();
    const enrol = await confirmMfaEnrolment(prisma, cfg, { userId: u.id, sessionId: s1?.sessionId ?? "", code: totpAt(secret, clock.getTime()) }, req);
    expect(enrol?.recoveryCodes).toHaveLength(8);

    const second = await login(prisma, cfg, { email: u.email, password: PASSWORD }, { ip: null, userAgent: null });
    if (!second.ok) throw new Error("login failed");
    expect(second.needsMfa).toBe(true);
    const s2 = await getSessionUser(prisma, cfg, second.token);
    expect(s2?.mfaVerified).toBe(false);

    clock = new Date(clock.getTime() + 60_000);
    const code = totpAt(secret, clock.getTime());
    expect(await verifyMfaForSession(prisma, cfg, { sessionId: s2?.sessionId ?? "", userId: u.id, code }, req)).toBe(true);
    expect((await getSessionUser(prisma, cfg, second.token))?.mfaVerified).toBe(true);

    // same code again (replay) must fail
    const third = await login(prisma, cfg, { email: u.email, password: PASSWORD }, { ip: null, userAgent: null });
    if (!third.ok) throw new Error("login failed");
    const s3 = await getSessionUser(prisma, cfg, third.token);
    expect(await verifyMfaForSession(prisma, cfg, { sessionId: s3?.sessionId ?? "", userId: u.id, code }, req)).toBe(false);

    // recovery code works once
    const rc = enrol?.recoveryCodes[0] ?? "";
    expect(await verifyMfaForSession(prisma, cfg, { sessionId: s3?.sessionId ?? "", userId: u.id, code: rc }, req)).toBe(true);
    expect(await verifyMfaForSession(prisma, cfg, { sessionId: s3?.sessionId ?? "", userId: u.id, code: rc }, req)).toBe(false);
  });

  it("flags Super Admin without MFA as needing enrolment", async () => {
    const u = await newUser("super_admin", "sa");
    const r = await login(prisma, cfg, { email: u.email, password: PASSWORD }, { ip: null, userAgent: null });
    if (!r.ok) throw new Error("login failed");
    expect(r.mustEnrolMfa).toBe(true);
    expect((await getSessionUser(prisma, cfg, r.token))?.mustEnrolMfa).toBe(true);
  });

  it("changing password revokes other sessions but keeps the current one", async () => {
    const u = await newUser("support_agent", "chg");
    const a = await login(prisma, cfg, { email: u.email, password: PASSWORD }, { ip: null, userAgent: null });
    const b = await login(prisma, cfg, { email: u.email, password: PASSWORD }, { ip: null, userAgent: null });
    if (!a.ok || !b.ok) throw new Error("login failed");
    const sa = await getSessionUser(prisma, cfg, a.token);
    const res = await changePassword(prisma, cfg, { userId: u.id, sessionId: sa?.sessionId ?? "", current: PASSWORD, next: "a brand new passphrase!" }, req);
    expect(res.ok).toBe(true);
    expect(await getSessionUser(prisma, cfg, a.token)).not.toBeNull();
    expect(await getSessionUser(prisma, cfg, b.token)).toBeNull();
  });

  it("rate limits by key within a window and resets after it", async () => {
    const key = `test:${run}`;
    const limit = { max: 3, windowSeconds: 60 };
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await consumeRateLimit(prisma, cfg, key, limit));
    expect(results).toEqual([true, true, true, false, false]);
    clock = new Date(clock.getTime() + 61_000);
    expect(await consumeRateLimit(prisma, cfg, key, limit)).toBe(true);
  });

  it("writes audit entries without secrets", async () => {
    const u = await newUser("support_agent", "aud");
    await login(prisma, cfg, { email: u.email, password: "definitely wrong pw" }, { ip: null, userAgent: null });
    const logs = await prisma.auditLog.findMany({ where: { actorId: u.id } });
    expect(logs.some((l) => l.action === "auth.login.failed")).toBe(true);
    expect(JSON.stringify(logs)).not.toContain("definitely wrong pw");
  });
});
