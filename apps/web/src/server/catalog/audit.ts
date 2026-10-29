import type { Db } from "./inventory";

export async function recordAudit(
  db: Db,
  e: { actorId: string | null; action: string; entityType: string; entityId: string; metadata?: Record<string, string | number | boolean | null> },
): Promise<void> {
  await db.auditLog.create({
    data: { actorId: e.actorId, action: e.action, entityType: e.entityType, entityId: e.entityId, ...(e.metadata ? { metadata: e.metadata } : {}) },
  });
}
