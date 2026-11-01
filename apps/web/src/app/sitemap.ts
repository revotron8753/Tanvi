import { getPrisma } from "@tanvi/database";
import { POLICY_SLUGS } from "@tanvi/validation";
import type { MetadataRoute } from "next";
import { env } from "@/server/env";
import { publishedPosts } from "@/server/community/service";
import { getContent, getLiveCategories, LIVE } from "@/server/storefront/queries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().SITE_URL;
  const prisma = getPrisma();
  const [categories, products, story, policies, posts] = await Promise.all([
    getLiveCategories(prisma),
    prisma.product.findMany({ where: LIVE, select: { slug: true, updatedAt: true }, take: 50000 }),
    getContent(prisma, "page.our-story"),
    Promise.all(POLICY_SLUGS.map(async (s) => ((await getContent(prisma, `policy.${s}`)) ? s : null))),
    publishedPosts(prisma),
  ]);
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "daily", priority: 0.8 },
    ...categories.map((c) => ({ url: `${base}/collections/${c.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${base}/products/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    { url: `${base}/contact` },
    { url: `${base}/journal` },
    ...posts.map((p) => ({ url: `${base}/journal/${p.slug}`, lastModified: p.updatedAt })),
    ...(story ? [{ url: `${base}/our-story` }] : []),
    ...policies.filter((s): s is NonNullable<typeof s> => s !== null).map((s) => ({ url: `${base}/policies/${s}` })),
  ];
}
