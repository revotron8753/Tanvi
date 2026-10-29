import { getPrisma } from "@tanvi/database";
import { getAuth } from "@/server/auth/guard";
import { getStorage } from "@/server/storage/instance";

// Public catalogue media. Only fixed rendition names are served; draft/archived product images and
// unpublished category images are visible to staff with products.read only.
const PRODUCT_KEY = /^products\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/(thumb|md|lg)\.webp$/;
const CATEGORY_KEY = /^categories\/([0-9a-f-]{36})\/(thumb|md|lg)\.webp$/;

const CONTENT_KEY = /^content\/[a-z0-9-]+\/(thumb|md|lg)\.webp$/;

const NOT_FOUND = () => new Response("Not found", { status: 404 });

export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }): Promise<Response> {
  const key = (await ctx.params).key.join("/");
  const prisma = getPrisma();
  let isPublic = false;

  const pm = PRODUCT_KEY.exec(key);
  const cm = CATEGORY_KEY.exec(key);
  if (pm) {
    const img = await prisma.productImage.findUnique({ where: { id: pm[2] ?? "" }, include: { product: { select: { id: true, status: true } } } });
    if (!img || img.product.id !== pm[1]) return NOT_FOUND();
    isPublic = img.product.status === "PUBLISHED";
  } else if (cm) {
    const cat = await prisma.category.findUnique({ where: { id: cm[1] ?? "" }, select: { isPublished: true } });
    if (!cat) return NOT_FOUND();
    isPublic = cat.isPublished;
  } else if (CONTENT_KEY.test(key)) {
    isPublic = true; // site content images are intended for public pages
  } else {
    return NOT_FOUND();
  }

  if (!isPublic) {
    const auth = await getAuth();
    if (!auth?.mfaVerified || !auth.permissions.has("products.read")) return NOT_FOUND();
  }

  const obj = await getStorage().get(key);
  if (!obj) return NOT_FOUND();
  return new Response(new Uint8Array(obj.body), {
    headers: {
      "Content-Type": obj.contentType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": isPublic ? "public, max-age=86400" : "private, no-store",
    },
  });
}
