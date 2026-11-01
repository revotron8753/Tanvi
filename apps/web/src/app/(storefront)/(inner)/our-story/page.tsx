import { getPrisma } from "@tanvi/database";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContent } from "@/server/storefront/queries";

export const metadata: Metadata = { title: "Our story", alternates: { canonical: "/our-story" } };
export const dynamic = "force-dynamic";

export default async function OurStory() {
  const c = await getContent(getPrisma(), "page.our-story");
  if (!c) notFound();
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-4xl">{c.title ?? "Our story"}</h1>
      <div className="mt-6 space-y-4 whitespace-pre-line leading-relaxed">{c.body}</div>
    </article>
  );
}
