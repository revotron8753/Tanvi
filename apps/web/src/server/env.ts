import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  /** 32 random bytes, base64. Encrypts MFA secrets at rest. */
  APP_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded"),
  /** Secret used to HMAC IP addresses before storing them. */
  APP_HASH_SECRET: z.string().min(32),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),
  /** Razorpay credentials. All three unset = online payment is simply unavailable (COD/WhatsApp only). */
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** Override the Razorpay API origin (sandbox/test doubles only). Leave unset in production. */
  RAZORPAY_API_BASE_URL: z.string().url().optional(),
  /** Bearer secret for /api/cron/* endpoints (reservation expiry). */
  CRON_SECRET: z.string().min(24).optional(),
  /** Public origin used for canonical URLs, sitemap and Open Graph, e.g. https://www.example.com (no trailing slash). */
  SITE_URL: z.string().url().default("http://localhost:3000"),
  /** Directory for uploaded images (local-disk driver). Must be outside the web root and persisted in production. */
  STORAGE_LOCAL_DIR: z.string().min(1).default(".data/uploads"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parsed lazily. On failure, reports variable NAMES and problems only; never values. */
export function env(): Env {
  if (cached) return cached;
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  cached = result.data;
  return cached;
}
