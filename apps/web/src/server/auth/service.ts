import type { PrismaClient } from "@tanvi/database";
import type { PermissionKey } from "@tanvi/domain";
import { decrypt, encrypt, hmacHex, randomToken, sha256Hex } from "./crypto";
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from "./password";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "./totp";

/**
 * Framework-free auth service (no next/* imports) so it can be tested against a real database.
 * Cookie handling and route guards live in ./guard.ts.
 */
export interface AuthConfig {
  idleMinutes: number;
  absoluteHours: number;
  encryptionKey: string;
  hashSecret: string;
  now?: () => Date;
}

export interface RequestInfo {
  ip: string | null;
  userAgent: string | null;
}

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const IP_LIMIT = { max: 30, windowSeconds: 15 * 60 };
const MFA_LIMIT = { max: 6, windowSeconds: 10 * 60 };

const nowOf = (cfg: AuthConfig): Date => (cfg.now ? cfg.now() : new Date());
const addMs = (d: Date, ms: number): Date => new Date(d.getTime() + ms);
const ipHash = (cfg: AuthConfig, ip: string | null): string | null => (ip ? hmacHex(cfg.hashSecret, ip) : null);

export async function audit(
  prisma: PrismaClient,
  cfg: AuthConfig,
  entry: { actorId?: string | null; action: string; entityType?: string; entityId?: string; metadata?: Record<string, string | number | boolean | null>; ip?: string | null },
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
      ipHash: ipHash(cfg, entry.ip ?? null),
    },
  });
}

/** Fixed-window counter in the DB. Returns true when the action is allowed. */
export async function consumeRateLimit(
  prisma: PrismaClient,
  cfg: AuthConfig,
  key: string,
  limit: { max: number; windowSeconds: number },
): Promise<boolean> {
  const now = nowOf(cfg);
  const windowStart = new Date(now.getTime() - limit.windowSeconds * 1000);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart") VALUES (${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" < ${windowStart} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" < ${windowStart} THEN ${now} ELSE "RateLimitBucket"."windowStart" END
    RETURNING "count"`;
  return (rows[0]?.count ?? 1) <= limit.max;
}

export type LoginResult =
  | { ok: true; token: string; needsMfa: boolean; mustEnrolMfa: boolean; mustChangePassword: boolean }
  | { ok: false; reason: "invalid" | "locked" | "rate_limited" };

async function createSession(
  prisma: PrismaClient,
  cfg: AuthConfig,
  userId: string,
  mfaVerified: boolean,
  req: RequestInfo,
): Promise<string> {
  const token = randomToken();
  const now = nowOf(cfg);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256Hex(token),
      mfaVerified,
      idleExpiresAt: addMs(now, cfg.idleMinutes * 60_000),
      absoluteExpiresAt: addMs(now, cfg.absoluteHours * 3_600_000),
      ipHash: ipHash(cfg, req.ip),
      userAgent: req.userAgent?.slice(0, 200) ?? null,
    },
  });
  return token;
}

export async function login(
  prisma: PrismaClient,
  cfg: AuthConfig,
  input: { email: string; password: string },
  req: RequestInfo,
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const now = nowOf(cfg);

  if (req.ip && !(await consumeRateLimit(prisma, cfg, `login:ip:${ipHash(cfg, req.ip)}`, IP_LIMIT))) {
    await audit(prisma, cfg, { action: "auth.login.rate_limited", ip: req.ip });
    return { ok: false, reason: "rate_limited" };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { roles: { include: { role: true } } },
  });

  if (!user || !user.isActive) {
    await verifyPassword(await dummyHash(), input.password); // equalise timing
    await audit(prisma, cfg, { action: "auth.login.failed", metadata: { reason: "unknown_or_inactive" }, ip: req.ip });
    return { ok: false, reason: "invalid" };
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    await audit(prisma, cfg, { actorId: user.id, action: "auth.login.locked", ip: req.ip });
    return { ok: false, reason: "locked" };
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? addMs(now, LOCK_MINUTES * 60_000) : null },
    });
    await audit(prisma, cfg, { actorId: user.id, action: lock ? "auth.account.locked" : "auth.login.failed", ip: req.ip });
    return { ok: false, reason: "invalid" };
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  const hasMfa = user.mfaEnabledAt !== null;
  const isSuperAdmin = user.roles.some((r) => r.role.key === "super_admin");
  const token = await createSession(prisma, cfg, user.id, !hasMfa, req);
  await audit(prisma, cfg, { actorId: user.id, action: "auth.login.password_ok", metadata: { mfa: hasMfa }, ip: req.ip });
  return {
    ok: true,
    token,
    needsMfa: hasMfa,
    mustEnrolMfa: isSuperAdmin && !hasMfa,
    mustChangePassword: user.mustChangePassword,
  };
}

export interface SessionUser {
  sessionId: string;
  user: { id: string; email: string; name: string; mfaEnabled: boolean; mustChangePassword: boolean };
  roleKeys: string[];
  permissions: ReadonlySet<PermissionKey>;
  mfaVerified: boolean;
  mustEnrolMfa: boolean;
}

export async function getSessionUser(prisma: PrismaClient, cfg: AuthConfig, token: string): Promise<SessionUser | null> {
  const now = nowOf(cfg);
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: {
      user: { include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } },
    },
  });
  if (!session || session.revokedAt || session.idleExpiresAt <= now || session.absoluteExpiresAt <= now || !session.user.isActive) {
    return null;
  }
  // Slide the idle window, but not on every request.
  if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
    const idle = addMs(now, cfg.idleMinutes * 60_000);
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now, idleExpiresAt: idle < session.absoluteExpiresAt ? idle : session.absoluteExpiresAt },
    });
  }
  const roleKeys = session.user.roles.map((r) => r.role.key);
  const permissions = new Set<PermissionKey>(
    session.user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key as PermissionKey)),
  );
  const mfaEnabled = session.user.mfaEnabledAt !== null;
  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      mfaEnabled,
      mustChangePassword: session.user.mustChangePassword,
    },
    roleKeys,
    permissions,
    mfaVerified: session.mfaVerified,
    mustEnrolMfa: roleKeys.includes("super_admin") && !mfaEnabled,
  };
}

export async function revokeSession(prisma: PrismaClient, sessionId: string): Promise<void> {
  await prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllUserSessions(prisma: PrismaClient, userId: string, exceptSessionId?: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}

export async function verifyMfaForSession(
  prisma: PrismaClient,
  cfg: AuthConfig,
  input: { sessionId: string; userId: string; code: string },
  req: RequestInfo,
): Promise<boolean> {
  if (!(await consumeRateLimit(prisma, cfg, `mfa:${input.userId}`, MFA_LIMIT))) return false;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId }, include: { recoveryCodes: true } });
  if (!user.mfaSecretEnc) return false;
  const code = input.code.replace(/\s|-/g, "");
  let ok = false;

  const step = verifyTotp(decrypt(user.mfaSecretEnc, cfg.encryptionKey), code, nowOf(cfg).getTime());
  if (step !== null && (user.mfaLastStep === null || step > user.mfaLastStep)) {
    await prisma.user.update({ where: { id: user.id }, data: { mfaLastStep: step } });
    ok = true;
  } else if (step === null) {
    const hash = sha256Hex(code.toLowerCase());
    const rc = user.recoveryCodes.find((c) => c.usedAt === null && c.codeHash === hash);
    if (rc) {
      await prisma.mfaRecoveryCode.update({ where: { id: rc.id }, data: { usedAt: nowOf(cfg) } });
      await audit(prisma, cfg, { actorId: user.id, action: "auth.mfa.recovery_code_used", ip: req.ip });
      ok = true;
    }
  }
  if (ok) await prisma.session.update({ where: { id: input.sessionId }, data: { mfaVerified: true } });
  await audit(prisma, cfg, { actorId: user.id, action: ok ? "auth.mfa.verified" : "auth.mfa.failed", ip: req.ip });
  return ok;
}

/** Step 1 of enrolment: create a pending secret (not yet active). */
export async function beginMfaEnrolment(
  prisma: PrismaClient,
  cfg: AuthConfig,
  userId: string,
  email: string,
): Promise<{ secret: string; otpauth: string }> {
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { mfaSecretEnc: encrypt(secret, cfg.encryptionKey), mfaEnabledAt: null, mfaLastStep: null } });
  return { secret, otpauth: otpauthUrl(secret, email) };
}

/** Step 2: confirm with a valid code; activates MFA and returns one-time recovery codes. */
export async function confirmMfaEnrolment(
  prisma: PrismaClient,
  cfg: AuthConfig,
  input: { userId: string; sessionId: string; code: string },
  req: RequestInfo,
): Promise<{ recoveryCodes: string[] } | null> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  if (!user.mfaSecretEnc || user.mfaEnabledAt) return null;
  const step = verifyTotp(decrypt(user.mfaSecretEnc, cfg.encryptionKey), input.code.replace(/\s/g, ""), nowOf(cfg).getTime());
  if (step === null) return null;
  const codes = Array.from({ length: 8 }, () => randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "x").slice(0, 10));
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { mfaEnabledAt: nowOf(cfg), mfaLastStep: step } }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
    prisma.mfaRecoveryCode.createMany({ data: codes.map((c) => ({ userId: user.id, codeHash: sha256Hex(c) })) }),
    prisma.session.update({ where: { id: input.sessionId }, data: { mfaVerified: true } }),
  ]);
  await audit(prisma, cfg, { actorId: user.id, action: "auth.mfa.enabled", ip: req.ip });
  return { recoveryCodes: codes };
}

export async function changePassword(
  prisma: PrismaClient,
  cfg: AuthConfig,
  input: { userId: string; sessionId: string; current: string; next: string },
  req: RequestInfo,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const problem = passwordProblem(input.next);
  if (problem) return { ok: false, message: problem };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  if (!(await verifyPassword(user.passwordHash, input.current))) return { ok: false, message: "Current password is incorrect." };
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.next), mustChangePassword: false } });
  await revokeAllUserSessions(prisma, user.id, input.sessionId);
  await audit(prisma, cfg, { actorId: user.id, action: "auth.password.changed", ip: req.ip });
  return { ok: true };
}

export async function createStaffUser(
  prisma: PrismaClient,
  cfg: AuthConfig,
  input: { actorId: string | null; email: string; name: string; password: string; roleKey: string; mustChangePassword: boolean },
): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const problem = passwordProblem(input.password);
  if (problem) return { ok: false, message: problem };
  const email = input.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return { ok: false, message: "A user with that email already exists." };
  const role = await prisma.role.findUnique({ where: { key: input.roleKey } });
  if (!role) return { ok: false, message: "Unknown role." };
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      mustChangePassword: input.mustChangePassword,
      roles: { create: { roleId: role.id } },
    },
  });
  await audit(prisma, cfg, { actorId: input.actorId, action: "user.created", entityType: "User", entityId: user.id, metadata: { role: input.roleKey } });
  return { ok: true, userId: user.id };
}
