import { timingSafeEqual } from "node:crypto";
import { getPrisma } from "@tanvi/database";
import { env } from "@/server/env";
import { expireUnpaidOrders } from "@/server/orders/service";

export const dynamic = "force-dynamic";

/** Releases stock held by unpaid online orders past their reservation window. Called by a scheduler with CRON_SECRET. */
export async function POST(req: Request): Promise<Response> {
  const secret = env().CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return new Response("Unauthorized", { status: 401 });
  const expired = await expireUnpaidOrders(getPrisma());
  return Response.json({ expired });
}
