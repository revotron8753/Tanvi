import { getPrisma } from "@tanvi/database";
import type { Metadata } from "next";
import Link from "next/link";
import { publishedPosts } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Journal", alternates: { canonical: "/journal" } };

export default async function JournalPage() {
  const posts = await publishedPosts(getPrisma());
  return (
    <div>
      <h1 className="text-center text-5xl tracking-[0.1em]">Journal</h1>
      {posts.length === 0 ? (
        <p className="mt-10 text-center text-cocoa">New stories are on the way. Browse the <Link href="/shop" className="underline">collection</Link> in the meantime.</p>
      ) : (
        <ul className="mt-12 grid gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/journal/${p.slug}`} className="group block">
                <div className="aspect-[4/3] overflow-hidden bg-beige">
                  {p.imageKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/media/${p.imageKey}/md.webp`} alt={p.imageAlt ?? ""} width={800} height={600} loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  ) : null}
                </div>
                <h2 className="mt-4 text-2xl">{p.title}</h2>
                {p.excerpt ? <p className="mt-2 text-cocoa">{p.excerpt}</p> : null}
                <p className="mt-3 text-[0.8rem] uppercase tracking-[0.18em] underline underline-offset-4">Read the story</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
