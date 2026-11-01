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
    <div>
      <section aria-label="Welcome" className="relative grid min-h-[78vh] items-end overflow-hidden bg-espresso text-ivory">
        {hero?.imageKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/media/${hero.imageKey}/lg.webp`} alt={hero.imageAlt ?? ""} width={1600} height={900} className="absolute inset-0 size-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-espresso/80 via-espresso/10 to-transparent" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-[90rem] px-5 pb-14 md:pb-20">
          {hero?.eyebrow ? <p className="mb-3 text-sm tracking-[0.2em] text-champagne">{hero.eyebrow}</p> : null}
          <h1 className="max-w-3xl text-5xl font-medium leading-[1.05] md:text-7xl">{hero?.title ?? "TANVI"}</h1>
          {hero?.subtitle ? <p className="mt-4 max-w-xl text-lg text-ivory/90">{hero.subtitle}</p> : null}
          <Link href={hero?.ctaHref ?? "/shop"} className="mt-8 inline-flex min-h-11 items-center border border-ivory px-8 text-[0.8rem] uppercase tracking-[0.2em] hover:bg-ivory hover:text-espresso">
            {hero?.ctaLabel ?? "Explore"}
          </Link>
        </div>
      </section>

      {data.categories.length > 0 ? (
        <section aria-labelledby="coll-h">
          <h2 id="coll-h" className="sr-only">Collections</h2>
          <ul>
            {data.categories.map((c, i) => (
              <li key={c.id} className={`grid md:grid-cols-2 ${i % 2 ? "bg-beige/50" : "bg-ivory"}`}>
                <Link href={`/collections/${c.slug}`} className={`group block aspect-[4/5] overflow-hidden bg-beige md:aspect-auto md:min-h-[34rem] ${i % 2 ? "md:order-2" : ""}`} tabIndex={-1} aria-hidden="true">
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/media/${c.imageUrl}/lg.webp`} alt="" width={1600} height={1200} loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                  ) : null}
                </Link>
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <h3 className="text-4xl font-medium tracking-[0.12em] md:text-5xl">{c.name}</h3>
                  <Link href={`/collections/${c.slug}`} className="mt-8 border-b border-espresso pb-1 text-[0.8rem] uppercase tracking-[0.2em] hover:text-cocoa">
                    Explore {c.name}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

        {story ? (
          <section aria-labelledby="story-h" className="mx-auto max-w-2xl text-center">
            <h2 id="story-h" className="text-4xl tracking-[0.12em]">{story.title}</h2>
            <p className="mt-6 whitespace-pre-line text-lg leading-8">{story.body}</p>
            {story.ctaHref ? <Link href={story.ctaHref} className="mt-8 inline-block border-b border-espresso pb-1 text-[0.8rem] uppercase tracking-[0.2em]">{story.ctaLabel ?? "Read more"}</Link> : null}
          </section>
        ) : null}

        {/* AI try-on promotion stays hidden until the feature is actually live (Phase 6). */}
        {tryon && process.env.NEXT_PUBLIC_TRYON_ENABLED === "true" ? (
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
    </div>
  );
}
