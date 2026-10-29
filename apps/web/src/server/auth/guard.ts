import "server-only";
import { getPrisma } from "@tanvi/database";
import type { PermissionKey } from "@tanvi/domain";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { env } from "../env";
import type { AuthConfig, RequestInfo, SessionUser } from "./service";
import { getSessionUser } from "./service";

const isProd = process.env.NODE_ENV === "production";
/** `__Host-` prefix pins the cookie to this host over HTTPS with Path=/. Not usable on http://localhost. */
export const SESSION_COOKIE = isProd ? "__Host-tanvi_session" : "tanvi_session";

export function authConfig(): AuthConfig {
  const e = env();
  return {
    idleMinutes: e.SESSION_IDLE_MINUTES,
    absoluteHours: e.SESSION_ABSOLUTE_HOURS,
    encryptionKey: e.APP_ENCRYPTION_KEY,
    hashSecret: e.APP_HASH_SECRET,
  };
}

export async function requestInfo(): Promise<RequestInfo> {
  const h = await headers();
  // Only meaningful behind a trusted reverse proxy that sets/overwrites X-Forwarded-For (see docs/SECURITY.md).
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  return { ip: ip || null, userAgent: h.get("user-agent") };
}

export async function setSessionCookie(token: string, maxAgeHours: number): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeHours * 3600,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Resolves the current session once per request. Returns null when not signed in. */
export const getAuth = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(getPrisma(), authConfig(), token);
});

export class ForbiddenError extends Error {
  constructor(public readonly permission: string) {
    super("Forbidden");
  }
}

interface RequireOptions {
  /** Allow a half-authenticated session (password ok, MFA not yet verified). Used only by the MFA page. */
  allowUnverifiedMfa?: boolean;
  /** Allow access while MFA enrolment / password change is still pending. Used only by the security page. */
  allowPendingSetup?: boolean;
}

/**
 * THE guard for every admin page, route handler and server action.
 * Redirects when not signed in / not fully authenticated; calls forbidden() (403) when the permission is missing.
 */
export async function requireAdmin(permission?: PermissionKey, options: RequireOptions = {}): Promise<SessionUser> {
  const auth = await getAuth();
  if (!auth) redirect("/admin/login");
  if (!auth.mfaVerified && !options.allowUnverifiedMfa) redirect("/admin/mfa");
  if (!options.allowPendingSetup && (auth.mustEnrolMfa || auth.user.mustChangePassword)) redirect("/admin/security");
  if (permission && !auth.permissions.has(permission)) forbidden();
  return auth;
}

/** For server actions, where throwing is preferable to redirecting. */
export async function requirePermissionForAction(permission: PermissionKey): Promise<SessionUser> {
  const auth = await getAuth();
  if (!auth || !auth.mfaVerified || auth.mustEnrolMfa || auth.user.mustChangePassword) throw new ForbiddenError(permission);
  if (!auth.permissions.has(permission)) throw new ForbiddenError(permission);
  return auth;
}
