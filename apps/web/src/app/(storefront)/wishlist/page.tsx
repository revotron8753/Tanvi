import { getPrisma } from "@tanvi/database";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductGrid } from "@/components/store/product-card";
import { peekWishlistId } from "@/server/shopper";
import { LIVE } from "@/server/storefront/queries";
import { listShopProducts } from "@/server/storefront/queries";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const prisma = getPrisma();
  const id = await peekWishlistId();
  const ids = id ? (await prisma.wishlistItem.findMany({ where: { wishlistId: id, product: LIVE }, select: { productId: true }, orderBy: { createdAt: "desc" } })).map((i) => i.productId) : [];
  const products = ids.length ? (await listShopProducts(prisma, { ids, page: 1, pageSize: 100 })).items : [];
  return (
    <>
      <h1 className="mb-6 text-4xl">Wishlist</h1>
      {products.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-cocoa">Nothing saved yet. Tap “Save to wishlist” on any piece you like.</p>
          <Link href="/shop" className="mt-4 inline-block underline">Browse the collection</Link>
        </div>
      ) : (
        <ProductGrid products={products} />
      )}
    </>
  );
}
