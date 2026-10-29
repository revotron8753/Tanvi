import { getPrisma } from "@tanvi/database";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopListing, type SP } from "@/features/shop/listing";

export const dynamic = "force-dynamic";

async function getCategory(slug: string) {
  return getPrisma().category.findFirst({ where: { slug, isPublished: true } });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await getCategory((await params).slug);
  if (!c) return {};
  return {
    title: c.name,
    description: c.description ?? undefined,
    alternates: { canonical: `/collections/${c.slug}` },
    openGraph: { title: c.name, description: c.description ?? undefined, images: c.imageUrl ? [`/media/${c.imageUrl}/lg.webp`] : undefined },
  };
}

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const category = await getCategory((await params).slug);
  if (!category) notFound();
  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl">{category.name}</h1>
        {category.description ? <p className="mt-2 max-w-prose text-cocoa">{category.description}</p> : null}
      </header>
      <ShopListing basePath={`/collections/${category.slug}`} categorySlug={category.slug} sp={await searchParams} />
    </>
  );
}
