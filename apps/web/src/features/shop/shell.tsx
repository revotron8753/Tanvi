import { getPrisma } from "@tanvi/database";
import { POLICY_SLUGS } from "@tanvi/validation";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { newsletterAction } from "@/features/shop/actions";
import { NEWSLETTER_CONSENT_TEXT } from "./consent";
import { peekCartCount } from "@/server/shopper";
import { getContent, getLiveCategories } from "@/server/storefront/queries";

export async function StoreHeader() {
  const [categories, count] = await Promise.all([getLiveCategories(getPrisma()), peekCartCount()]);
  const nav = "text-[0.8rem] uppercase tracking-[0.18em] text-espresso hover:text-cocoa";
  return (
    <header className="sticky top-0 z-30 border-b border-beige bg-ivory/95 backdrop-blur">
      <div className="mx-auto grid max-w-[90rem] grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 pb-2 pt-4">
        <div className="flex gap-5">
          <Link href="/search" className={nav}>Search</Link>
          <Link href="/our-story" className={`${nav} hidden sm:inline`}>Our story</Link>
          <Link href="/journal" className={`${nav} hidden md:inline`}>Journal</Link>
        </div>
        <Link href="/" className="font-display text-4xl font-medium tracking-[0.35em] text-espresso md:text-5xl" aria-label="Tanvi home">
          TANVI
        </Link>
        <div className="flex justify-end gap-5">
          <Link href="/wishlist" className={nav}>Wishlist</Link>
          <Link href="/cart" className={nav}>
            Bag{count > 0 ? <span aria-label={`${count} items`}> ({count})</span> : null}
          </Link>
        </div>
      </div>
      <nav aria-label="Main" className="mx-auto flex max-w-[90rem] flex-wrap justify-center gap-x-8 gap-y-1 px-5 pb-3 pt-1">
        <Link href="/shop" className={nav}>Shop all</Link>
        {categories.map((c) => (
          <Link key={c.id} href={`/collections/${c.slug}`} className={nav}>
            {c.name}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export async function StoreFooter() {
  const prisma = getPrisma();
  const [contact, social, policies] = await Promise.all([
    getContent(prisma, "site.contact"),
    getContent(prisma, "site.social"),
    Promise.all(POLICY_SLUGS.map(async (s) => ({ slug: s, content: await getContent(prisma, `policy.${s}`) }))),
  ]);
  return (
    <footer className="bg-espresso text-ivory">
      <div className="mx-auto grid max-w-[90rem] gap-12 px-5 py-16 md:grid-cols-3">
        <div>
          <p className="font-display text-3xl tracking-[0.35em]">TANVI</p>
          {contact ? (
            <address className="mt-4 space-y-1 text-sm not-italic">
              {contact.address ? <p className="whitespace-pre-line">{contact.address}</p> : null}
              {contact.hours ? <p className="whitespace-pre-line">{contact.hours}</p> : null}
              {contact.phone ? <p>{contact.phone}</p> : null}
              {contact.email ? <p>{contact.email}</p> : null}
            </address>
          ) : null}
          {social && (social.instagram || social.facebook) ? (
            <p className="mt-4 flex gap-4 text-sm">
              {social.instagram ? <a href={social.instagram} rel="noopener noreferrer" className="underline">Instagram</a> : null}
              {social.facebook ? <a href={social.facebook} rel="noopener noreferrer" className="underline">Facebook</a> : null}
            </p>
          ) : null}
        </div>
        <nav aria-label="Information" className="space-y-2 text-sm">
          <Link href="/our-story" className="block hover:underline">Our story</Link>
          <Link href="/journal" className="block hover:underline">Journal</Link>
          <Link href="/contact" className="block hover:underline">Contact</Link>
          {policies.filter((p) => p.content).map((p) => (
            <Link key={p.slug} href={`/policies/${p.slug}`} className="block hover:underline">
              {p.content?.title ?? p.slug}
            </Link>
          ))}
        </nav>
        <div>
          <h2 className="text-lg">Stay in touch</h2>
          <ActionForm action={newsletterAction} submitLabel="Subscribe" variant="secondary" className="mt-3 space-y-3 [&_button]:border-ivory [&_button]:text-ivory [&_button:hover]:bg-cocoa">
            <div className="[&_label]:text-ivory">
              <Field label="Email" name="email" type="email" autoComplete="email" required />
            </div>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" name="consent" className="mt-0.5" required />
              {NEWSLETTER_CONSENT_TEXT}
            </label>
          </ActionForm>
        </div>
      </div>
    </footer>
  );
}
