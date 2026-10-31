import "server-only";
import { getPrisma } from "@tanvi/database";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { authenticateDevice, getActiveSession } from "./service";

const DEVICE_COOKIE = "tanvi_kiosk_device";
const SESSION_COOKIE = "tanvi_kiosk_session";
const secure = process.env.NODE_ENV === "production";

export async function setDeviceCookie(credential: string): Promise<void> {
  (await cookies()).set(DEVICE_COOKIE, credential, { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 365 });
}
export async function setKioskSessionCookie(token: string, seconds: number): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: seconds });
}
export async function clearKioskSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The registered, non-revoked device behind this browser, or null. Never an admin or customer session. */
export const getDevice = cache(async () => {
  const c = (await cookies()).get(DEVICE_COOKIE)?.value;
  return c ? authenticateDevice(getPrisma(), c) : null;
});

export const getKioskSession = cache(async () => {
  const device = await getDevice();
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!device || !t) return null;
  const s = await getActiveSession(getPrisma(), t);
  return s && s.deviceId === device.id ? s : null; // a session only works on the device that started it
});

export async function requireDevice() {
  const d = await getDevice();
  if (!d) redirect("/kiosk/activate");
  return d;
}

export async function requireKioskSession() {
  await requireDevice();
  const s = await getKioskSession();
  if (!s) redirect("/kiosk");
  return s;
}
