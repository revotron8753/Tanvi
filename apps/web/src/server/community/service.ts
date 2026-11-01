import type { PrismaClient } from "@tanvi/database";
import { z } from "zod";
import { slugify } from "../catalog/slug";
import { LIVE } from "../storefront/queries";

/** Protects the moderation queue from floods: new reviews are refused beyond this many waiting. */
export const MAX_PENDING_REVIEWS = 200;

export const reviewInputSchema = z.object({
  productId: z.string().uuid(),
  authorName: z.string().trim().min(1, "Enter your name.").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email. It is never shown.").max(200),
  rating: z.coerce.number().int().min(1, "Choose a rating.").max(5),
  title: z.string().trim().max(100).optional(),
  body: z.string().trim().min(10, "Write at least a sentence.").max(2000),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

type Result = { ok: true } | { ok: false; message: string };

export async function submitReview(prisma: PrismaClient, input: ReviewInput): Promise<Result> {
  const product = await prisma.product.findFirst({ where: { id: input.productId, ...LIVE }, select: { id: true } });
  if (!product) return { ok: false, message: "This product isn't available." };
  if ((await prisma.review.count({ where: { status: "PENDING" } })) >= MAX_PENDING_REVIEWS) {
    return { ok: false, message: "We can't take new reviews right now. Please try again later." };
  }
  const existing = await prisma.review.findUnique({ where: { productId_email: { productId: input.productId, email: input.email } } });
  if (existing) return { ok: false, message: "You've already reviewed this product." };
  await prisma.review.create({
    data: { productId: input.productId, authorName: input.authorName, email: input.email, rating: input.rating, title: input.title || null, body: input.body },
  });
  return { ok: true };
}

export async function moderateReview(prisma: PrismaClient, id: string, status: "APPROVED" | "REJECTED" | "PENDING", actorId: string): Promise<boolean> {
  const res = await prisma.review.updateMany({ where: { id }, data: { status, moderatedAt: new Date(), moderatedById: actorId } });
  return res.count === 1;
}

export async function productReviewSummary(prisma: PrismaClient, productId: string) {
  const [agg, reviews] = await Promise.all([
    prisma.review.aggregate({ where: { productId, status: "APPROVED" }, _avg: { rating: true }, _count: true }),
    prisma.review.findMany({
      where: { productId, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, authorName: true, rating: true, title: true, body: true, createdAt: true },
    }),
  ]);
  return { count: agg._count, average: agg._avg.rating, reviews };
}

/** Latest approved reviews for the home page. Empty until staff approve some. */
export async function homeReviews(prisma: PrismaClient, take = 3) {
  return prisma.review.findMany({
    where: { status: "APPROVED", rating: { gte: 4 } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, authorName: true, rating: true, title: true, body: true, product: { select: { name: true, slug: true } } },
  });
}

// ---------- Journal ----------

export const journalInputSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(140),
  slug: z.string().trim().max(80).optional(),
  excerpt: z.string().trim().max(300).optional(),
  body: z.string().trim().min(1, "Write the post.").max(20000),
  imageAlt: z.string().trim().max(200).optional(),
  published: z.boolean(),
});
export type JournalInput = z.infer<typeof journalInputSchema>;

export async function saveJournalPost(
  prisma: PrismaClient,
  id: string | null,
  input: JournalInput,
  imageKey: string | null | undefined,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const slug = slugify(input.slug || input.title);
  if (!slug) return { ok: false, message: "The title or slug needs letters or numbers." };
  const clash = await prisma.journalPost.findUnique({ where: { slug } });
  if (clash && clash.id !== id) return { ok: false, message: "Another post already uses that URL slug." };
  const current = id ? await prisma.journalPost.findUnique({ where: { id } }) : null;
  if (id && !current) return { ok: false, message: "That post no longer exists." };
  const data = {
    slug,
    title: input.title,
    excerpt: input.excerpt || null,
    body: input.body,
    imageAlt: input.imageAlt || null,
    status: input.published ? ("PUBLISHED" as const) : ("DRAFT" as const),
    publishedAt: input.published ? (current?.publishedAt ?? new Date()) : null,
    ...(imageKey !== undefined ? { imageKey } : {}),
  };
  const row = id ? await prisma.journalPost.update({ where: { id }, data }) : await prisma.journalPost.create({ data });
  return { ok: true, id: row.id };
}

export async function publishedPosts(prisma: PrismaClient, take?: number) {
  return prisma.journalPost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    ...(take ? { take } : {}),
  });
}

export async function publishedPostBySlug(prisma: PrismaClient, slug: string) {
  return prisma.journalPost.findFirst({ where: { slug, status: "PUBLISHED" } });
}
