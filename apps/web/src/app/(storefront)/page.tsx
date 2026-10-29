import { getPrisma } from "@tanvi/database";
import Link from "next/link";
import { ProductGrid } from "@/components/store/product-card";
import { getContent, getHomepageData } from "@/server/storefront/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const prisma = getPrisma();
  const [data, hero, story, tryon] = await Promise.all([
    getHomepageData(prisma),
    getContent(prisma, "home.hero"),
    getContent(prisma, "home.story"),
    getContent(prisma, "home.tryon"),
  ]);
  const contact = await getContent(prisma, "site.contact");
  return (
    <div className="space-y-20">
      <section aria-label="Welcome" className="relative grid min-h-[28rem] items-end overflow-hidden bg-beige">
        {hero?.imageKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/media/${hero.imageKey}/lg.webp`} alt={hero.imageAlt ?? ""} width={1600} height={900} className="absolute inset-0 size-full object-cover" />
        ) : null}
        <div className="relative max-w-xl bg-ivory/90 p-8 md:m-10">
          {hero?.eyebrow ? <p className="text-xs uppercase tracking-[0.25em] text-cocoa">{hero.eyebrow}</p> : null}
          <h1 className="mt-2 text-5xl leading-tight">{hero?.title ?? "TANVI"}</h1>
          {hero?.subtitle ? <p className="mt-3 text-cocoa">{hero.subtitle}</p> : null}
          <Link href={hero?.ctaHref ?? "/shop"} className="mt-6 inline-flex min-h-11 items-center bg-espresso px-6 text-sm text-ivory hover:bg-cocoa">
            {hero?.ctaLabel ?? "Shop the collection"}
          </Link>
        </div>
      </section>

      {data.categories.length > 0 ? (
        <section aria-labelledby="coll-h">
          <h2 id="coll-h" className="mb-6 text-3xl">Collections</h2>
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {data.categories.map((c) => (
              <li key={c.id}>
                <Link href={`/collections/${c.slug}`} className="group relative block aspect-[4/5] overflow-hidden bg-beige">
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/media/${c.imageUrl}/md.webp`} alt="" width={800} height={1000} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : null}
                  <span className="absolute inset-x-0 bottom-0 bg-ivory/90 p-3 font-display text-xl">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.newArrivals.length > 0 ? (
        <section aria-labelledby="new-h">
          <h2 id="new-h" className="mb-6 text-3xl">New arrivals</h2>
          <ProductGrid products={data.newArrivals} />
        </section>
      ) : null}
      {data.featured.length > 0 ? (
        <section aria-labelledby="feat-h">
          <h2 id="feat-h" className="mb-6 text-3xl">Featured</h2>
          <ProductGrid products={data.featured} />
        </section>
      ) : null}

      {story ? (
        <section aria-labelledby="story-h" className="mx-auto max-w-3xl text-center">
          <h2 id="story-h" className="text-3xl">{story.title}</h2>
          <p className="mt-4 whitespace-pre-line leading-relaxed">{story.body}</p>
          {story.ctaHref ? <Link href={story.ctaHref} className="mt-4 inline-block underline">{story.ctaLabel ?? "Read more"}</Link> : null}
        </section>
      ) : null}

      {/* AI try-on promotion stays hidden until the feature is actually live (Phase 6). */}
      {tryon && process.env.NEXT_PUBLIC_TRYON_ENABLED === "true" ? (
        <section className="bg-beige p-10 text-center">
          <h2 className="text-3xl">{tryon.title}</h2>
          <p className="mt-3">{tryon.body}</p>
          <Link href="/try-on" className="mt-4 inline-block underline">{tryon.ctaLabel ?? "Try it"}</Link>
        </section>
      ) : null}

      {contact?.whatsappNumber ? (
        <section className="text-center" aria-label="WhatsApp">
          <a href={`https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent("Hi Tanvi, I'd like some help choosing.")}`} rel="noopener noreferrer" target="_blank" className="inline-flex min-h-11 items-center border border-espresso px-6 text-sm hover:bg-beige">
            Shop with us on WhatsApp
          </a>
        </section>
      ) : null}
    </div>
  );
}
