import type { PrismaClient } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import { whatsappConfigSchema, type OrderEvent, type WhatsAppConfig } from "@tanvi/validation";
import { MessagingError, type WhatsAppProvider } from "./provider";

const KEY = "whatsapp";
export const MAX_ATTEMPTS = 6;
const BACKOFF_MINUTES = [1, 5, 30, 120, 720];

export async function getWhatsAppConfig(db: Pick<PrismaClient, "setting">): Promise<WhatsAppConfig> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  const parsed = whatsappConfigSchema.safeParse(row?.data ?? {});
  return parsed.success ? parsed.data : whatsappConfigSchema.parse({});
}

export async function saveWhatsAppConfig(prisma: PrismaClient, cfg: WhatsAppConfig, actorId: string): Promise<void> {
  await prisma.setting.upsert({ where: { key: KEY }, update: { data: cfg }, create: { key: KEY, data: cfg } });
  await prisma.auditLog.create({ data: { actorId, action: "whatsapp.config_updated", entityType: "Setting", entityId: KEY } });
}

/** Indian 10-digit mobile → 12-digit number with country code. */
export const toE164Digits = (tenDigit: string): string => `91${tenDigit}`;

type OrderForMessage = { id: string; reference: string; contactName: string; contactPhone: string; totalPaise: number; shipment: { trackingNumber: string | null } | null };

function variableValue(name: string, o: OrderForMessage): string {
  switch (name) {
    case "customer_name": return o.contactName.split(" ")[0] ?? o.contactName;
    case "reference": return o.reference;
    case "total": return formatPaise(paise(o.totalPaise));
    case "tracking": return o.shipment?.trackingNumber ?? "-";
    default: return "";
  }
}

/**
 * Records that a notification should go out for a committed business event. Idempotent per (order, event).
 * It never sends anything itself and never throws into the order flow.
 */
export async function enqueueOrderEvent(prisma: PrismaClient, orderId: string, event: OrderEvent): Promise<void> {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { shipment: true } });
    if (!order) return;
    const cfg = await getWhatsAppConfig(prisma);
    const tpl = cfg.templates[event];
    const to = toE164Digits(order.contactPhone);
    let status: "PENDING" | "SKIPPED" = "PENDING";
    let reason: string | null = null;
    if (!tpl) {
      status = "SKIPPED";
      reason = "No template configured for this event";
    } else if (cfg.testMode && !cfg.allowedNumbers.includes(to)) {
      status = "SKIPPED";
      reason = "Test mode: number is not on the allow-list";
    }
    await prisma.outboxMessage.upsert({
      where: { dedupeKey: `${orderId}:${event}` },
      update: {},
      create: {
        channel: "WHATSAPP",
        purpose: "TRANSACTIONAL",
        event,
        orderId,
        toPhone: to,
        templateName: tpl?.name ?? null,
        language: tpl?.language ?? null,
        variables: tpl ? tpl.variables.map((v) => variableValue(v, order)) : [],
        dedupeKey: `${orderId}:${event}`,
        status,
        lastError: reason,
      },
    });
  } catch (e) {
    console.error("enqueueOrderEvent failed", e instanceof Error ? e.message : "unknown");
  }
}

/** Marketing needs a recorded, un-withdrawn opt-in for this exact purpose. Transactional messages never use this. */
export async function hasMarketingConsent(prisma: PrismaClient, phone: string): Promise<boolean> {
  const c = await prisma.customerConsent.findFirst({ where: { purpose: "marketing_whatsapp", phone, withdrawnAt: null } });
  return c !== null;
}

export interface ProcessResult {
  processed: number;
  sent: number;
  retried: number;
  dead: number;
  reason?: "provider_not_configured";
}

/**
 * Sends due messages. Safe to run concurrently (rows are claimed with SKIP LOCKED). Without a provider it does
 * nothing: messages stay PENDING and no attempts are consumed.
 */
export async function processOutbox(prisma: PrismaClient, provider: WhatsAppProvider | null, now = new Date(), batch = 20): Promise<ProcessResult> {
  const out: ProcessResult = { processed: 0, sent: 0, retried: 0, dead: 0 };
  if (!provider) return { ...out, reason: "provider_not_configured" };

  const claimed = await prisma.$transaction(async (tx) => {
    const ids = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "OutboxMessage"
      WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${now} AND "templateName" IS NOT NULL
      ORDER BY "nextAttemptAt" ASC LIMIT ${batch} FOR UPDATE SKIP LOCKED`;
    // Push the retry time forward inside the claim so a crashed worker's rows come back later, not instantly.
    await tx.outboxMessage.updateMany({ where: { id: { in: ids.map((i) => i.id) } }, data: { nextAttemptAt: new Date(now.getTime() + 10 * 60_000) } });
    return tx.outboxMessage.findMany({ where: { id: { in: ids.map((i) => i.id) } } });
  });

  for (const m of claimed) {
    out.processed++;
    try {
      const r = await provider.sendTemplate({
        to: m.toPhone,
        templateName: m.templateName ?? "",
        language: m.language ?? "",
        variables: Array.isArray(m.variables) ? m.variables.map(String) : [],
        idempotencyKey: m.dedupeKey,
      });
      await prisma.outboxMessage.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId: r.providerMessageId, attempts: { increment: 1 }, lastError: null } });
      out.sent++;
    } catch (e) {
      const retryable = e instanceof MessagingError ? e.retryable : true;
      const attempts = m.attempts + 1;
      const safe = e instanceof MessagingError ? e.message.slice(0, 200) : "Unexpected send error";
      if (!retryable) {
        await prisma.outboxMessage.update({ where: { id: m.id }, data: { status: "FAILED", attempts, lastError: safe } });
        out.dead++;
      } else if (attempts >= MAX_ATTEMPTS) {
        await prisma.outboxMessage.update({ where: { id: m.id }, data: { status: "DEAD", attempts, lastError: safe } });
        out.dead++;
      } else {
        const wait = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 720;
        await prisma.outboxMessage.update({ where: { id: m.id }, data: { attempts, lastError: safe, nextAttemptAt: new Date(now.getTime() + wait * 60_000) } });
        out.retried++;
      }
    }
  }
  return out;
}
