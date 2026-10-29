import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_KEYS, ROLE_LABELS } from "@tanvi/domain";
import type { PrismaClient } from "./generated/client";

/**
 * Initial category data. This is seed input only; the app always reads categories from the DB.
 * Editable afterwards in admin; re-running the seed does NOT overwrite admin edits to existing rows.
 */
const CATEGORIES = [
  { slug: "regular-wear", name: "Regular Wear" },
  { slug: "festive-wear", name: "Festive Wear" },
  { slug: "premium-wear", name: "Premium Wear" },
  { slug: "three-piece-kurtis", name: "Three-Piece Kurtis" },
  { slug: "short-tops", name: "Short Tops" },
  { slug: "co-ord-sets", name: "Co-ord Sets" },
] as const;

export async function seedCore(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const [i, c] of CATEGORIES.entries()) {
      await tx.category.upsert({
        where: { slug: c.slug },
        update: {},
        create: { slug: c.slug, name: c.name, displayOrder: i + 1, isPublished: true },
      });
    }

    for (const key of PERMISSIONS) {
      await tx.permission.upsert({ where: { key }, update: {}, create: { key } });
    }

    for (const roleKey of ROLE_KEYS) {
      const role = await tx.role.upsert({
        where: { key: roleKey },
        update: {},
        create: { key: roleKey, name: ROLE_LABELS[roleKey] },
      });
      // Only grant missing permissions: never revoke what an owner has customised.
      for (const permKey of DEFAULT_ROLE_PERMISSIONS[roleKey]) {
        const perm = await tx.permission.findUniqueOrThrow({ where: { key: permKey } });
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      }
    }

    await tx.stockLocation.upsert({
      where: { code: "MAIN" },
      update: {},
      create: { code: "MAIN", name: "Main store" },
    });
  });
}
