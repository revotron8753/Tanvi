import { Prisma, type PrismaClient } from "@tanvi/database";
import { settingsSchema, type Settings } from "@tanvi/validation";
import type { Db } from "../catalog/inventory";

const KEY = "business";

export async function getSettings(db: Db): Promise<Settings> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  const parsed = settingsSchema.safeParse(row?.data ?? {});
  return parsed.success ? parsed.data : settingsSchema.parse({});
}

export async function saveSettings(prisma: PrismaClient, settings: Settings, actorId: string): Promise<void> {
  await prisma.setting.upsert({ where: { key: KEY }, update: { data: settings }, create: { key: KEY, data: settings } });
  await prisma.auditLog.create({ data: { actorId, action: "settings.updated", entityType: "Setting", entityId: KEY, metadata: { taxMode: settings.taxMode, codEnabled: settings.codEnabled } satisfies Prisma.InputJsonValue } });
}

/** Invoices need real business details; until they exist no invoice is produced. */
export function invoiceBlockers(s: Settings): string[] {
  const out: string[] = [];
  if (s.taxMode === "UNSET") out.push("Choose whether prices include GST.");
  if (!s.gstin) out.push("Enter the business GSTIN.");
  if (!s.legalName) out.push("Enter the registered business name.");
  if (!s.businessAddress) out.push("Enter the registered business address.");
  if (!s.businessStateCode) out.push("Enter the business GST state code.");
  if (!s.invoicePrefix) out.push("Choose an invoice number prefix.");
  return out;
}
