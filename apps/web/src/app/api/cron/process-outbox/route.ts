import { timingSafeEqual } from "node:crypto";
import { getPrisma } from "@tanvi/database";
import { env } from "@/server/env";
import { getWhatsAppProvider } from "@/server/messaging/instance";
import { processOutbox } from "@/server/messaging/outbox";

export const dynamic = "force-dynamic";

/** Sends due notifications. Scheduler calls this with CRON_SECRET. With no provider it reports so and sends nothing. */
export async function POST(req: Request): Promise<Response> {
  const secret = env().CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return new Response("Unauthorized", { status: 401 });
  return Response.json(await processOutbox(getPrisma(), getWhatsAppProvider()));
}
