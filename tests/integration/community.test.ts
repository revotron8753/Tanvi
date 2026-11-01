import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createPrisma } from "@tanvi/database";
import { seedCore } from "../../packages/database/src/seed-core";
import {
  homeReviews, journalInputSchema, moderateReview, productReviewSummary, publishedPostBySlug, publishedPosts, reviewInputSchema, saveJournalPost, submitReview,
} from "../../apps/web/src/server/community/service";

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("reviews and journal (real PostgreSQL)", () => {
  const prisma = createPrisma(url ?? "");
  const run = randomBytes(3).toString("hex");
  let live = "";
  let draft = "";
  let actorId = "";

  const review = (productId: string, email: string, over: Partial<{ rating: number; body: string }> = {}) =>
    reviewInputSchema.parse({ productId, authorName: "Asha", email, rating: over.rating ?? 5, body: over.body ?? "Lovely fabric and fit." });

  beforeAll(async () => {
    await seedCore(prisma);
    const categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "festive-wear" } })).id;
    live = (await prisma.product.create({ data: { slug: `rv-${run}-live`, name: `Review ${run} live`, categoryId, pricePaise: 100000, status: "PUBLISHED", publishedAt: new Date() } })).id;
    draft = (await prisma.product.create({ data: { slug: `rv-${run}-draft`, name: `Review ${run} draft`, categoryId, pricePaise: 100000, status: "DRAFT" } })).id;
    actorId = (await prisma.user.create({ data: { email: `rv-${run}@example.test`, name: "rv", passwordHash: "x" } })).id;
  });

  it("a new review is hidden until staff approve it", async () => {
    expect((await submitReview(prisma, review(live, `a-${run}@example.test`))).ok).toBe(true);
    expect((await productReviewSummary(prisma, live)).count).toBe(0);
    const row = await prisma.review.findFirstOrThrow({ where: { productId: live } });
    expect(await moderateReview(prisma, row.id, "APPROVED", actorId)).toBe(true);
    const s = await productReviewSummary(prisma, live);
    expect(s.count).toBe(1);
    expect(s.average).toBe(5);
    expect(s.reviews[0]).not.toHaveProperty("email");
  });

  it("allows one review per email per product and refuses unavailable products", async () => {
    const again = await submitReview(prisma, review(live, `a-${run}@example.test`));
    expect(again).toEqual({ ok: false, message: "You've already reviewed this product." });
    expect((await submitReview(prisma, review(draft, `b-${run}@example.test`))).ok).toBe(false);
  });

  it("rejected reviews never appear, and ratings outside 1-5 are refused", async () => {
    await submitReview(prisma, review(live, `c-${run}@example.test`, { rating: 1, body: "Not for me at all." }));
    const row = await prisma.review.findFirstOrThrow({ where: { productId: live, email: `c-${run}@example.test` } });
    await moderateReview(prisma, row.id, "REJECTED", actorId);
    expect((await productReviewSummary(prisma, live)).count).toBe(1);
    expect(reviewInputSchema.safeParse({ productId: live, authorName: "A", email: "x@y.co", rating: 6, body: "long enough text" }).success).toBe(false);
    await expect(prisma.review.create({ data: { productId: live, authorName: "A", email: "d@y.co", rating: 9, body: "x" } })).rejects.toThrow();
  });

  it("home reviews only include approved 4-5 star reviews", async () => {
    const home = await homeReviews(prisma, 50);
    expect(home.every((r) => r.rating >= 4)).toBe(true);
    expect(home.some((r) => r.authorName === "Asha")).toBe(true);
  });

  it("journal drafts are private, published posts are public, slugs are unique", async () => {
    const input = journalInputSchema.parse({ title: `Story ${run}`, body: "Once upon a loom.", published: false });
    const created = await saveJournalPost(prisma, null, input, undefined);
    expect(created.ok).toBe(true);
    const slug = `story-${run}`;
    expect(await publishedPostBySlug(prisma, slug)).toBeNull();
    if (!created.ok) return;
    await saveJournalPost(prisma, created.id, { ...input, published: true }, undefined);
    expect((await publishedPostBySlug(prisma, slug))?.publishedAt).toBeInstanceOf(Date);
    expect((await publishedPosts(prisma)).some((p) => p.slug === slug)).toBe(true);
    const clash = await saveJournalPost(prisma, null, input, undefined);
    expect(clash.ok).toBe(false);
  });
});
