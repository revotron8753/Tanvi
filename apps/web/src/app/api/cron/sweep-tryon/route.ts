import { timingSafeEqual } from "node:crypto";
import { getPrisma } from "@tanvi/database";
import { env } from "@/server/env";
import { getStorage } from "@/server/storage/instance";
import { sweepTryOn } from "@/server/tryon/service";

export const dynamic = "force-dynamic";

/** Retention backstop: expires idle sessions and deletes their temporary photos/results. Run every few minutes. */
export async function POST(req: Request): Promise<Response> {
  const secret = env().CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return new Response("Unauthorized", { status: 401 });
  return Response.json(await sweepTryOn(getPrisma(), getStorage()));
}
