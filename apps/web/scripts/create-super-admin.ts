/**
 * One-off bootstrap for the first Super Admin. Credentials come from the environment, never from source.
 *   BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_NAME=... BOOTSTRAP_ADMIN_PASSWORD=... npm run create-super-admin -w @tanvi/web
 * The account is forced to change its password at first sign-in, and (as Super Admin) to enrol MFA.
 */
import { createPrisma } from "@tanvi/database";
import { createStaffUser } from "../src/server/auth/service";

const { DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_PASSWORD } = process.env;
if (!DATABASE_URL || !BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) {
  console.error("Set DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (and optionally BOOTSTRAP_ADMIN_NAME).");
  process.exit(1);
}

const prisma = createPrisma(DATABASE_URL);
try {
  const res = await createStaffUser(
    prisma,
    { idleMinutes: 30, absoluteHours: 12, encryptionKey: "", hashSecret: "unused-for-audit-without-ip-xxxxxxxx" },
    {
      actorId: null,
      email: BOOTSTRAP_ADMIN_EMAIL,
      name: BOOTSTRAP_ADMIN_NAME ?? "Super Admin",
      password: BOOTSTRAP_ADMIN_PASSWORD,
      roleKey: "super_admin",
      mustChangePassword: true,
    },
  );
  if (!res.ok) {
    console.error(`Could not create user: ${res.message}`);
    process.exit(1);
  }
  console.log(`Super Admin created (${BOOTSTRAP_ADMIN_EMAIL}). Sign in at /admin/login and change the password.`);
} finally {
  await prisma.$disconnect();
}
