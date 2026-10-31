import { getPrisma } from "@tanvi/database";
import { NextResponse } from "next/server";
import { resolveContinuation } from "@/server/tryon/service";

export const dynamic = "force-dynamic";

/** QR landing. Resolves an opaque, expiring token to one product page. Reveals nothing else. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const slug = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? await resolveContinuation(getPrisma(), token) : null;
  if (!slug) return new Response("This link has expired. Please scan the code again at the store.", { status: 404 });
  return NextResponse.redirect(new URL(`/products/${slug}?utm_source=kiosk&utm_medium=qr`, req.url), 302);
}
