"use server";

import { getPrisma } from "@tanvi/database";
import { redirect } from "next/navigation";
import { changePasswordSchema, loginSchema, totpOrRecoveryCodeSchema } from "@tanvi/validation";
import { z } from "zod";
import {
  authConfig,
  clearSessionCookie,
  getAuth,
  requestInfo,
  requireAdmin,
  setSessionCookie,
} from "@/server/auth/guard";
import {
  audit,
  beginMfaEnrolment,
  changePassword,
  confirmMfaEnrolment,
  login,
  revokeSession,
  verifyMfaForSession,
} from "@/server/auth/service";

export interface FormState {
  error?: string;
  ok?: string;
  secret?: string;
  otpauth?: string;
  recoveryCodes?: string[];
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  const cfg = authConfig();
  const result = await login(getPrisma(), cfg, parsed.data, await requestInfo());
  if (!result.ok) {
    if (result.reason === "rate_limited") return { error: "Too many attempts. Please wait a few minutes and try again." };
    if (result.reason === "locked") return { error: "This account is temporarily locked. Try again later." };
    return { error: "Incorrect email or password." };
  }
  await setSessionCookie(result.token, cfg.absoluteHours);
  if (result.needsMfa) redirect("/admin/mfa");
  if (result.mustEnrolMfa || result.mustChangePassword) redirect("/admin/security");
  redirect("/admin");
}

export async function mfaAction(_prev: FormState, form: FormData): Promise<FormState> {
  const auth = await requireAdmin(undefined, { allowUnverifiedMfa: true, allowPendingSetup: true });
  const code = totpOrRecoveryCodeSchema.safeParse(form.get("code"));
  if (!code.success) return { error: "Enter the 6-digit code." };
  const ok = await verifyMfaForSession(
    getPrisma(),
    authConfig(),
    { sessionId: auth.sessionId, userId: auth.user.id, code: code.data },
    await requestInfo(),
  );
  if (!ok) return { error: "That code is not valid. Check your authenticator app and try again." };
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const auth = await getAuth();
  if (auth) {
    await revokeSession(getPrisma(), auth.sessionId);
    await audit(getPrisma(), authConfig(), { actorId: auth.user.id, action: "auth.logout", ip: (await requestInfo()).ip });
  }
  await clearSessionCookie();
  redirect("/admin/login");
}

export async function beginMfaAction(): Promise<FormState> {
  const auth = await requireAdmin(undefined, { allowPendingSetup: true, allowUnverifiedMfa: false });
  if (auth.user.mfaEnabled) return { error: "Two-factor authentication is already enabled." };
  const { secret, otpauth } = await beginMfaEnrolment(getPrisma(), authConfig(), auth.user.id, auth.user.email);
  return { secret, otpauth };
}

export async function confirmMfaAction(_prev: FormState, form: FormData): Promise<FormState> {
  const auth = await requireAdmin(undefined, { allowPendingSetup: true });
  const code = z.string().min(6).max(8).safeParse(form.get("code"));
  if (!code.success) return { error: "Enter the 6-digit code." };
  const res = await confirmMfaEnrolment(
    getPrisma(),
    authConfig(),
    { userId: auth.user.id, sessionId: auth.sessionId, code: code.data },
    await requestInfo(),
  );
  if (!res) return { error: "That code did not match. Start again if the problem continues." };
  return { ok: "Two-factor authentication is on. Save these recovery codes now; they are shown only once.", recoveryCodes: res.recoveryCodes };
}

export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const auth = await requireAdmin(undefined, { allowPendingSetup: true });
  const parsed = changePasswordSchema.safeParse({ current: form.get("current"), next: form.get("next"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: "Fill in all fields." };
  if (parsed.data.next !== parsed.data.confirm) return { error: "The new passwords do not match." };
  const res = await changePassword(
    getPrisma(),
    authConfig(),
    { userId: auth.user.id, sessionId: auth.sessionId, current: parsed.data.current, next: parsed.data.next },
    await requestInfo(),
  );
  if (!res.ok) return { error: res.message };
  return { ok: "Password updated. Other devices were signed out." };
}
