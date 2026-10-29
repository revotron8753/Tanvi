import { getPrisma } from "@tanvi/database";
import { POLICY_SLUGS } from "@tanvi/validation";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContent } from "@/server/storefront/queries";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  if (!(POLICY_SLUGS as readonly string[]).includes(slug)) return null;
  return getContent(getPrisma(), `policy.${slug}`);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await load((await params).slug);
  return c ? { title: c.title ?? "Policy", alternates: { canonical: `/policies/${(await params).slug}` } } : {};
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const c = await load((await params).slug);
  if (!c) notFound(); // never show invented policy text; unpublished policies simply don't exist yet
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-4xl">{c.title}</h1>
      <div className="mt-6 space-y-4 whitespace-pre-line leading-relaxed">{c.body}</div>
    </article>
  );
}
