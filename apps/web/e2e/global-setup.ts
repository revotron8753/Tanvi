import { randomBytes } from "node:crypto";
import { createPrisma } from "@tanvi/database";
import { seedCore } from "../../../packages/database/src/seed-core";
import { encrypt } from "../src/server/auth/crypto";
import { createStaffUser } from "../src/server/auth/service";
import { generateTotpSecret } from "../src/server/auth/totp";

export const E2E = {
  password: "e2e passphrase long enough",
  pmEmail: "e2e-pm@example.test",
  saEmail: "e2e-sa@example.test",
  smEmail: "e2e-sm@example.test",
};

/** Seeds the TEST database with real users via the real service code. Fixtures live only here. */
export default async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL_TEST;
  const key = process.env.E2E_ENCRYPTION_KEY;
  if (!url || !key) throw new Error("Set DATABASE_URL_TEST and E2E_ENCRYPTION_KEY to run e2e (see docs/TESTING.md)");
  const prisma = createPrisma(url);
  const cfg = { idleMinutes: 30, absoluteHours: 12, encryptionKey: key, hashSecret: randomBytes(32).toString("hex") };
  try {
    await seedCore(prisma);
    await prisma.rateLimitBucket.deleteMany({});
    for (const [email, roleKey] of [[E2E.pmEmail, "product_manager"], [E2E.saEmail, "super_admin"], [E2E.smEmail, "store_manager"]] as const) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        // Users with stock-ledger history cannot be deleted (append-only), so reset them instead.
        await prisma.user.update({ where: { id: existing.id }, data: { isActive: true, failedLoginCount: 0, lockedUntil: null, mfaSecretEnc: null, mfaEnabledAt: null, mfaLastStep: null } });
        await prisma.session.deleteMany({ where: { userId: existing.id } });
        continue;
      }
      const r = await createStaffUser(prisma, cfg, { actorId: null, email, name: roleKey, password: E2E.password, roleKey, mustChangePassword: false });
      if (!r.ok) throw new Error(r.message);
    }
    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { email: E2E.saEmail },
      data: { mfaSecretEnc: encrypt(secret, key), mfaEnabledAt: new Date() },
    });
    process.env.E2E_SA_TOTP_SECRET = secret;
    // Expose to test workers through a file-free channel: Playwright forwards process.env set in globalSetup.
  } finally {
    await prisma.$disconnect();
  }
}
