import type { Metadata } from "next";
import { ShopListing, type SP } from "@/features/shop/listing";

export const metadata: Metadata = { title: "Shop all", alternates: { canonical: "/shop" } };
export const dynamic = "force-dynamic";

export default async function ShopPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <>
      <h1 className="mb-6 text-4xl">Shop all</h1>
      <ShopListing basePath="/shop" sp={await searchParams} />
    </>
  );
}
