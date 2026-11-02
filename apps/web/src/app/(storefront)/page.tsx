import { getPrisma } from "@tanvi/database";
import Link from "next/link";
import { ProductGrid } from "@/components/store/product-card";
import { Stars } from "@/components/store/stars";
import { homeReviews, publishedPosts } from "@/server/community/service";
import { getContent, getHomepageData } from "@/server/storefront/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const prisma = getPrisma();
  const [data, hero, story, tryon, reviews, posts] = await Promise.all([
    getHomepageData(prisma),
    getContent(prisma, "home.hero"),
    getContent(prisma, "home.story"),
    getContent(prisma, "home.tryon"),
    homeReviews(prisma),
    publishedPosts(prisma, 3),
  ]);
  const contact = await getContent(prisma, "site.contact");
  const withImage = data.categories.filter((c) => c.imageUrl);
  const withoutImage = data.categories.filter((c) => !c.imageUrl);
  const showTryOn = Boolean(tryon && process.env.NEXT_PUBLIC_TRYON_ENABLED === "true");
  const hasShelf = data.newArrivals.length > 0 || data.featured.length > 0 || showTryOn || Boolean(contact?.whatsappNumber);
  return (
    <div>
      <section aria-label="Welcome" className="relative grid min-h-[86vh] place-items-center overflow-hidden bg-espresso text-ivory">
        {hero?.imageKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/media/${hero.imageKey}/lg.webp`} alt={hero.imageAlt ?? ""} width={1600} height={900} className="hero-img absolute inset-0 size-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-espresso/40" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-5 border border-champagne/40 md:inset-8" aria-hidden="true" />
        <div className="hero-copy relative mx-auto flex max-w-3xl flex-col items-center px-8 py-24 text-center">
          {hero?.eyebrow ? <p className="mb-6 text-sm tracking-[0.3em] text-champagne">{hero.eyebrow}</p> : null}
          <h1 className="text-6xl font-light leading-[1.02] tracking-[0.12em] md:text-8xl">{hero?.title ?? "TANVI"}</h1>
          <span className="mt-8 block h-px w-24 bg-champagne" aria-hidden="true" />
          {hero?.subtitle ? <p className="mt-8 max-w-xl font-display text-2xl font-light italic leading-snug text-ivory/90">{hero.subtitle}</p> : null}
          <Link href={hero?.ctaHref ?? "/shop"} className="mt-12 inline-flex min-h-12 items-center border border-champagne px-10 text-[0.8rem] uppercase tracking-[0.3em] text-ivory hover:bg-champagne hover:text-espresso">
            {hero?.ctaLabel ?? "Discover the collection"}
          </Link>
        </div>
      </section>

      {data.categories.length > 0 ? (
        <div className="overflow-hidden border-y border-beige bg-ivory py-4" aria-hidden="true">
          <div className="marquee flex w-max gap-12 whitespace-nowrap font-display text-2xl tracking-[0.3em] text-cocoa">
            {[0, 1].map((k) => (
              <div key={k} className="flex gap-12">
                {[...data.categories, ...data.categories].map((c, i) => (
                  <span key={`${k}-${i}`} className="flex items-center gap-12">
                    {c.name.toUpperCase()}
                    <span className="text-champagne">&#10022;</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {withImage.length > 0 ? (
        <section aria-labelledby="coll-h">
          <h2 id="coll-h" className="sr-only">Collections</h2>
          <ul>
            {withImage.map((c, i) => (
              <li key={c.id} className={`grid md:grid-cols-2 ${i % 2 ? "bg-beige/50" : "bg-ivory"}`}>
                <Link href={`/collections/${c.slug}`} className={`group block aspect-[4/5] overflow-hidden bg-beige md:aspect-auto md:min-h-[34rem] ${i % 2 ? "md:order-2" : ""}`} tabIndex={-1} aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/media/${c.imageUrl}/lg.webp`} alt="" width={1600} height={1200} loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                </Link>
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <h3 className="text-4xl font-light tracking-[0.14em] md:text-5xl">{c.name}</h3>
                  <Link href={`/collections/${c.slug}`} className="mt-8 border-b border-espresso pb-1 text-[0.8rem] uppercase tracking-[0.25em] hover:text-cocoa">
                    Explore {c.name}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {withoutImage.length > 0 ? (
        <section aria-labelledby="idx-h" className="mx-auto max-w-5xl px-5 py-24">
          <h2 id="idx-h" className="mb-12 text-center text-sm font-sans uppercase tracking-[0.35em] text-cocoa">The collections</h2>
          <ul className="border-t border-espresso/20">
            {withoutImage.map((c) => (
              <li key={c.id} className="border-b border-espresso/20">
                <Link href={`/collections/${c.slug}`} className="group flex items-baseline justify-between gap-6 py-7 md:py-9">
                  <span className="font-display text-4xl font-light tracking-[0.06em] transition-transform duration-500 group-hover:translate-x-3 md:text-6xl">{c.name}</span>
                  <span className="text-[0.75rem] uppercase tracking-[0.25em] text-cocoa group-hover:text-espresso">Explore</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasShelf ? (
      <div className="mx-auto max-w-[90rem] space-y-24 px-5 py-24">
        {data.newArrivals.length > 0 ? (
          <section aria-labelledby="new-h">
            <h2 id="new-h" className="mb-10 text-center text-4xl tracking-[0.12em]">New arrivals</h2>
            <ProductGrid products={data.newArrivals} />
          </section>
        ) : null}
        {data.featured.length > 0 ? (
          <section aria-labelledby="feat-h">
            <h2 id="feat-h" className="mb-10 text-center text-4xl tracking-[0.12em]">Featured</h2>
            <ProductGrid products={data.featured} />
          </section>
        ) : null}

        {/* AI try-on promotion stays hidden until the feature is actually live (Phase 6). */}
        {tryon && showTryOn ? (
          <section className="bg-beige px-6 py-16 text-center">
            <h2 className="text-4xl tracking-[0.12em]">{tryon.title}</h2>
            <p className="mx-auto mt-4 max-w-xl">{tryon.body}</p>
            <Link href="/try-on" className="mt-6 inline-block border-b border-espresso pb-1 text-[0.8rem] uppercase tracking-[0.2em]">{tryon.ctaLabel ?? "Try it"}</Link>
          </section>
        ) : null}

        {contact?.whatsappNumber ? (
          <section className="text-center" aria-label="WhatsApp">
            <a href={`https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent("Hi Tanvi, I'd like some help choosing.")}`} rel="noopener noreferrer" target="_blank" className="inline-flex min-h-11 items-center border border-espresso px-8 text-[0.8rem] uppercase tracking-[0.2em] hover:bg-espresso hover:text-ivory">
              Shop with us on WhatsApp
            </a>
          </section>
        ) : null}
      </div>
      ) : null}

      {story ? (
        <section aria-labelledby="story-h" className={`grid bg-espresso text-ivory ${story.imageKey ? "md:grid-cols-2" : ""}`}>
          {story.imageKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/media/${story.imageKey}/lg.webp`} alt={story.imageAlt ?? ""} width={1600} height={1200} loading="lazy" className="size-full max-h-[40rem] object-cover" />
          ) : null}
          <div className="mx-auto flex max-w-xl flex-col justify-center px-6 py-20 text-center md:px-12">
            <h2 id="story-h" className="text-4xl tracking-[0.12em]">{story.title ?? "About Tanvi"}</h2>
            <p className="mt-6 whitespace-pre-line text-lg leading-8 text-ivory/90">{story.body}</p>
            <Link href={story.ctaHref ?? "/our-story"} className="mx-auto mt-8 inline-block border-b border-champagne pb-1 text-[0.8rem] uppercase tracking-[0.2em] text-champagne hover:text-ivory">{story.ctaLabel ?? "Our story"}</Link>
          </div>
        </section>
      ) : null}

      {reviews.length > 0 ? (
        <section aria-labelledby="rev-h" className="bg-beige/50 px-5 py-24">
          <h2 id="rev-h" className="mb-12 text-center text-4xl tracking-[0.12em]">What our customers say</h2>
          <ul className="mx-auto grid max-w-[90rem] gap-10 md:grid-cols-3">
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-col items-center text-center">
                <Stars rating={r.rating} />
                <blockquote className="mt-4 max-w-sm font-display text-2xl leading-snug">&ldquo;{r.title ?? r.body.slice(0, 90)}&rdquo;</blockquote>
                <p className="mt-4 text-sm text-cocoa">{r.authorName} on <Link href={`/products/${r.product.slug}`} className="underline">{r.product.name}</Link></p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {posts.length > 0 ? (
        <section aria-labelledby="jr-h" className="mx-auto max-w-[90rem] px-5 py-24">
          <div className="mb-10 flex items-end justify-between gap-4">
            <h2 id="jr-h" className="text-4xl tracking-[0.12em]">From the journal</h2>
            <Link href="/journal" className="border-b border-espresso pb-1 text-[0.8rem] uppercase tracking-[0.2em]">All stories</Link>
          </div>
          <ul className="grid gap-8 md:grid-cols-3">
            {posts.map((p) => (
              <li key={p.id}>
                <Link href={`/journal/${p.slug}`} className="group block">
                  <div className="aspect-[4/3] overflow-hidden bg-beige">
                    {p.imageKey ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/media/${p.imageKey}/md.webp`} alt={p.imageAlt ?? ""} width={800} height={600} loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    ) : null}
                  </div>
                  <h3 className="mt-4 text-2xl">{p.title}</h3>
                  {p.excerpt ? <p className="mt-2 text-cocoa">{p.excerpt}</p> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

    </div>
  );
}
