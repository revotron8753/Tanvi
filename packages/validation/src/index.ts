import { z } from "zod";

export const emailSchema = z.string().trim().email().max(254);

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: z.string().max(128),
  roleKey: z.string().min(1).max(50),
});

export const changePasswordSchema = z.object({
  current: z.string().min(1).max(128),
  next: z.string().max(128),
  confirm: z.string().max(128),
});

export const totpOrRecoveryCodeSchema = z.string().trim().min(6).max(20);
