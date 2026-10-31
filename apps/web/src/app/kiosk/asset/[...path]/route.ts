import { getPrisma } from "@tanvi/database";
import { getKioskSession } from "@/server/tryon/kiosk";
import { getJobForSession } from "@/server/tryon/service";
import { getStorage } from "@/server/storage/instance";

export const dynamic = "force-dynamic";

/** Private, session-bound images: the customer's own photo and their own results. Never cached, never shared. */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const session = await getKioskSession();
  if (!session) return new Response("Not found", { status: 404 });
  const [kind, jobId] = (await ctx.params).path;
  let key: string | null = null;
  if (kind === "input" && !jobId) key = session.inputKey;
  else if (kind === "result" && jobId && /^[0-9a-f-]{36}$/.test(jobId)) key = (await getJobForSession(getPrisma(), session.id, jobId))?.resultKey ?? null;
  if (!key || !key.startsWith(`tryon/${session.id}/`)) return new Response("Not found", { status: 404 });
  const obj = await getStorage().get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(obj.body), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
