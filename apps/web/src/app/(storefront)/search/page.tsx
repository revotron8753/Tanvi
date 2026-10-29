import type { Metadata } from "next";
import { ShopListing, type SP } from "@/features/shop/listing";

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <>
      <h1 className="mb-6 text-4xl">Search</h1>
      <ShopListing basePath="/search" sp={await searchParams} withSearchBox />
    </>
  );
}
