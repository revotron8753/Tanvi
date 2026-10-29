"use server";

import { getPrisma } from "@tanvi/database";
import { revalidatePath } from "next/cache";
import { createUserSchema } from "@tanvi/validation";
import { z } from "zod";
import { authConfig, requirePermissionForAction } from "@/server/auth/guard";
import { audit, createStaffUser, revokeAllUserSessions } from "@/server/auth/service";
import type { FormState } from "./actions";

export async function createUserAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requirePermissionForAction("users.write");
  const parsed = createUserSchema.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    password: form.get("password"),
    roleKey: form.get("roleKey"),
  });
  if (!parsed.success) return { error: "Check the name, email, password and role." };
  const res = await createStaffUser(getPrisma(), authConfig(), {
    actorId: actor.user.id,
    ...parsed.data,
    mustChangePassword: true,
  });
  if (!res.ok) return { error: res.message };
  revalidatePath("/admin/users");
  return { ok: "User created. They must change the password at first sign-in." };
}

export async function setUserActiveAction(form: FormData): Promise<void> {
  const actor = await requirePermissionForAction("users.write");
  const userId = z.string().uuid().parse(form.get("userId"));
  const active = form.get("active") === "true";
  if (userId === actor.user.id) return; // cannot deactivate yourself
  const prisma = getPrisma();
  await prisma.user.update({ where: { id: userId }, data: { isActive: active } });
  if (!active) await revokeAllUserSessions(prisma, userId);
  await audit(prisma, authConfig(), { actorId: actor.user.id, action: active ? "user.activated" : "user.deactivated", entityType: "User", entityId: userId });
  revalidatePath("/admin/users");
}
