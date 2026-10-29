import { getPrisma } from "@tanvi/database";
import { POLICY_SLUGS, sizeChartSchema } from "@tanvi/validation";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Gallery } from "@/components/store/gallery";
import { ProductGrid } from "@/components/store/product-card";
import { PurchasePanel } from "@/components/store/purchase-panel";
import { toggleWishlistAction } from "@/features/shop/actions";
import { env } from "@/server/env";
import { peekWishlistId } from "@/server/shopper";
import { classifyAvailability } from "@/server/catalog/inventory";
import { getContent, getLiveProductBySlug, getRelated, unitPrice } from "@/server/storefront/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getLiveProductBySlug(getPrisma(), (await params).slug);
  if (!p) return {};
  const title = p.seoTitle || p.name;
  const description = p.seoDescription || p.description?.slice(0, 160) || undefined;
  const img = p.images[0];
  return {
    title,
    description,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: { title, description, type: "website", images: img ? [{ url: `/media/${img.storageKey}/lg.webp`, alt: img.altText }] : undefined },
  };
}

/** "1999.50" from paise by string operations (no floats), as schema.org expects a decimal string. */
const decimal = (p: number) => `${Math.trunc(p / 100)}.${String(p % 100).padStart(2, "0")}`;

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const prisma = getPrisma();
  const product = await getLiveProductBySlug(prisma, (await params).slug);
  if (!product) notFound();
  const [related, wishlistId, contact, policyLinks] = await Promise.all([
    getRelated(prisma, product.id, product.categoryId),
    peekWishlistId(),
    getContent(prisma, "site.contact"),
    Promise.all(POLICY_SLUGS.filter((s) => s === "shipping" || s === "returns").map(async (s) => ({ slug: s, c: await getContent(prisma, `policy.${s}`) }))),
  ]);
  const saved = wishlistId ? Boolean(await prisma.wishlistItem.findUnique({ where: { wishlistId_productId: { wishlistId, productId: product.id } } })) : false;
  const variants = product.variants.map((v) => ({
    id: v.id,
    size: v.size,
    colour: v.colour,
    pricePaise: unitPrice(product, v),
    status: classifyAvailability(v.balances).status,
  }));
  const chart = sizeChartSchema.safeParse(product.sizeChart);
  const base = env().SITE_URL;
  const anyAvailable = variants.some((v) => v.status !== "out_of_stock");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: product.name,
        description: product.description ?? undefined,
        sku: product.parentCode ?? product.variants[0]?.sku,
        image: product.images.map((i) => `${base}/media/${i.storageKey}/lg.webp`),
        category: product.category.name,
        offers: variants.map((v) => ({
          "@type": "Offer",
          sku: product.variants.find((x) => x.id === v.id)?.sku,
          priceCurrency: "INR",
          price: decimal(v.pricePaise),
          availability: v.status === "out_of_stock" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
          url: `${base}/products/${product.slug}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: base },
          { "@type": "ListItem", position: 2, name: product.category.name, item: `${base}/collections/${product.category.slug}` },
          { "@type": "ListItem", position: 3, name: product.name, item: `${base}/products/${product.slug}` },
        ],
      },
    ],
  };

  const details: [string, string | null][] = [
    ["Fabric", product.fabric], ["Fit", product.fit], ["Neckline", product.neckline], ["Sleeve length", product.sleeveLength],
    ["Length", product.garmentLength], ["Pattern", product.pattern],
  ];
  const waText = encodeURIComponent(`Hi Tanvi, I'd like to know more about "${product.name}" (${base}/products/${product.slug}).`);

  return (
    <>
      {/* JSON-LD is built from our own DB values and serialised; "<" is escaped to prevent script-tag breakout. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-cocoa">
        <Link href="/" className="hover:underline">Home</Link> / <Link href={`/collections/${product.category.slug}`} className="hover:underline">{product.category.name}</Link> / <span aria-current="page">{product.name}</span>
      </nav>
      <div className="grid gap-10 lg:grid-cols-2">
        <Gallery images={product.images.map((i) => ({ key: i.storageKey, alt: i.altText }))} name={product.name} />
        <div className="space-y-6">
          <div>
            <h1 className="text-4xl">{product.name}</h1>
            <p className="mt-1 text-xs text-cocoa">{product.parentCode ? `Code ${product.parentCode}` : null}</p>
          </div>
          {variants.length > 0 && anyAvailable ? (
            <PurchasePanel variants={variants} comparePaise={product.comparePricePaise} />
          ) : (
            <p className="text-lg text-danger">Currently out of stock</p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <form action={toggleWishlistAction}>
              <input type="hidden" name="productId" value={product.id} />
              <button type="submit" className="min-h-11 border border-espresso px-5 text-sm hover:bg-beige" aria-pressed={saved}>
                {saved ? "Saved to wishlist ✓" : "Save to wishlist"}
              </button>
            </form>
            {contact?.whatsappNumber ? (
              <a href={`https://wa.me/${contact.whatsappNumber}?text=${waText}`} rel="noopener noreferrer" target="_blank" className="min-h-11 content-center text-sm underline">
                Ask about this on WhatsApp
              </a>
            ) : null}
          </div>
          {product.description ? <p className="max-w-prose whitespace-pre-line">{product.description}</p> : null}
          {details.some(([, v]) => v) ? (
            <dl className="grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {details.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-cocoa">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {chart.success ? (
            <details className="border-t border-beige pt-3">
              <summary className="cursor-pointer text-sm font-medium">Size chart</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <caption className="sr-only">Size chart</caption>
                  <thead><tr>{chart.data.columns.map((c) => <th key={c} scope="col" className="py-1 pr-4 text-cocoa">{c}</th>)}</tr></thead>
                  <tbody>{chart.data.rows.map((r, i) => <tr key={i} className="border-t border-beige">{r.map((c, j) => (j === 0 ? <th key={j} scope="row" className="py-1 pr-4 font-medium">{c}</th> : <td key={j} className="py-1 pr-4">{c}</td>))}</tr>)}</tbody>
                </table>
              </div>
            </details>
          ) : null}
          {product.careInstructions ? (
            <details className="border-t border-beige pt-3">
              <summary className="cursor-pointer text-sm font-medium">Care instructions</summary>
              <p className="mt-2 whitespace-pre-line text-sm">{product.careInstructions}</p>
            </details>
          ) : null}
          {policyLinks.some((p) => p.c) ? (
            <div className="border-t border-beige pt-3 text-sm">
              <p className="font-medium">Shipping &amp; returns</p>
              <p className="mt-1 flex gap-4">
                {policyLinks.filter((p) => p.c).map((p) => <Link key={p.slug} href={`/policies/${p.slug}`} className="underline">{p.c?.title ?? p.slug}</Link>)}
              </p>
            </div>
          ) : null}
        </div>
      </div>
      {related.length > 0 ? (
        <section className="mt-16" aria-labelledby="related-h">
          <h2 id="related-h" className="mb-6 text-2xl">You may also like</h2>
          <ProductGrid products={related} />
        </section>
      ) : null}
    </>
  );
}
