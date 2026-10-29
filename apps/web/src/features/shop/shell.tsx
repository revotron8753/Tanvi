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
  return (
    <header className="border-b border-beige bg-ivory">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="font-display text-3xl tracking-[0.3em] text-espresso" aria-label="Tanvi home">
          TANVI
        </Link>
        <nav aria-label="Main" className="hidden gap-6 text-sm lg:flex">
          <Link href="/shop" className="hover:underline underline-offset-4">Shop all</Link>
          {categories.map((c) => (
            <Link key={c.id} href={`/collections/${c.slug}`} className="hover:underline underline-offset-4">
              {c.name}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/search" className="hover:underline underline-offset-4">Search</Link>
          <Link href="/wishlist" className="hover:underline underline-offset-4">Wishlist</Link>
          <Link href="/cart" className="hover:underline underline-offset-4">
            Bag{count > 0 ? <span aria-label={`${count} items`}> ({count})</span> : null}
          </Link>
        </div>
      </div>
      <nav aria-label="Collections" className="flex gap-4 overflow-x-auto border-t border-beige px-4 py-2 text-sm lg:hidden">
        <Link href="/shop" className="whitespace-nowrap">Shop all</Link>
        {categories.map((c) => (
          <Link key={c.id} href={`/collections/${c.slug}`} className="whitespace-nowrap">
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
    <footer className="mt-20 bg-espresso text-ivory">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-3">
        <div>
          <p className="font-display text-2xl tracking-[0.3em]">TANVI</p>
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
