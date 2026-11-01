import { getPrisma } from "@tanvi/database";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publishedPostBySlug } from "@/server/community/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await publishedPostBySlug(getPrisma(), (await params).slug);
  if (!p) return {};
  return { title: p.title, description: p.excerpt ?? undefined, alternates: { canonical: `/journal/${p.slug}` } };
}

export default async function JournalPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await publishedPostBySlug(getPrisma(), (await params).slug);
  if (!post) notFound();
  return (
    <article className="mx-auto max-w-2xl">
      <Link href="/journal" className="text-sm underline">All stories</Link>
      <h1 className="mt-6 text-5xl leading-tight">{post.title}</h1>
      {post.publishedAt ? <p className="mt-3 text-sm text-cocoa">{post.publishedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p> : null}
      {post.imageKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/media/${post.imageKey}/lg.webp`} alt={post.imageAlt ?? ""} width={1600} height={1000} className="mt-8 w-full" />
      ) : null}
      <div className="mt-8 space-y-5 text-lg leading-8">
        {post.body.split(/\n{2,}/).map((para, i) => (
          <p key={i} className="whitespace-pre-line">{para}</p>
        ))}
      </div>
    </article>
  );
}
