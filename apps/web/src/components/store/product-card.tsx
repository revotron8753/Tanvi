import Link from "next/link";
import type { ProductCardData } from "@/server/storefront/queries";
import { Price } from "./price";

const BADGE = { low_stock: "Few left", out_of_stock: "Sold out", in_stock: null } as const;

export function ProductCard({ product, priority = false }: { product: ProductCardData; priority?: boolean }) {
  const [first, second] = product.images;
  const prices = product.variants.map((v) => v.pricePaise ?? product.pricePaise);
  const from = prices.length ? Math.min(...prices, product.pricePaise) : product.pricePaise;
  const varies = prices.some((p) => p !== product.pricePaise);
  const badge = BADGE[product.availability];
  return (
    <article className="group">
      <Link href={`/products/${product.slug}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden bg-beige">
          {first ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/media/${first.storageKey}/md.webp`}
              srcSet={`/media/${first.storageKey}/thumb.webp 320w, /media/${first.storageKey}/md.webp 800w`}
              sizes="(min-width: 1024px) 25vw, 50vw"
              alt={first.altText}
              width={800}
              height={1067}
              loading={priority ? "eager" : "lazy"}
              className={`size-full object-cover transition-opacity duration-300 ${second ? "group-hover:opacity-0" : ""}`}
            />
          ) : null}
          {second ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/media/${second.storageKey}/md.webp`} alt="" width={800} height={1067} loading="lazy" className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          ) : null}
          {badge ? <span className="absolute left-2 top-2 bg-ivory px-2 py-1 text-xs text-espresso">{badge}</span> : null}
        </div>
        <h3 className="mt-3 font-sans text-sm text-espresso">{product.name}</h3>
        <p className="mt-1 text-sm">
          {varies ? <span className="text-cocoa">From </span> : null}
          <Price pricePaise={from} comparePaise={varies ? null : product.comparePricePaise} />
        </p>
      </Link>
    </article>
  );
}

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < 4} />
        </li>
      ))}
    </ul>
  );
}
