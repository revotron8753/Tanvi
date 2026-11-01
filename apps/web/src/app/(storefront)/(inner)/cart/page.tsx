import { formatPaise, paise } from "@tanvi/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { Price } from "@/components/store/price";
import { removeCartLineAction, updateCartLineAction } from "@/features/shop/actions";
import { peekCartView } from "@/server/shopper";

export const metadata: Metadata = { title: "Your bag", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cart = await peekCartView();
  if (!cart || cart.lines.length === 0) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-4xl">Your bag is empty</h1>
        <p className="mt-3 text-cocoa">Find something you love in our collections.</p>
        <Link href="/shop" className="mt-6 inline-flex min-h-11 items-center bg-espresso px-6 text-sm text-ivory hover:bg-cocoa">Continue shopping</Link>
      </div>
    );
  }
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
      <section aria-labelledby="bag-h">
        <h1 id="bag-h" className="mb-6 text-4xl">Your bag</h1>
        <ul className="divide-y divide-beige border-y border-beige">
          {cart.lines.map((l) => (
            <li key={l.variantId} className="flex gap-4 py-5">
              {l.imageKey ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/media/${l.imageKey}/thumb.webp`} alt={l.imageAlt} width={96} height={128} className="h-32 w-24 object-cover" />
              ) : (
                <div className="h-32 w-24 bg-beige" aria-hidden />
              )}
              <div className="flex-1 space-y-1 text-sm">
                <Link href={`/products/${l.productSlug}`} className="text-base underline-offset-4 hover:underline">{l.name}</Link>
                <p className="text-cocoa">{l.size} · {l.colour} · {l.sku}</p>
                <p><Price pricePaise={l.unitPricePaise} /></p>
                {l.problem === "unavailable" ? <p role="alert" className="text-danger">This item is no longer available. Please remove it.</p> : null}
                {l.problem === "insufficient" ? <p role="alert" className="text-danger">{l.available > 0 ? `Only ${l.available} left. Please reduce the quantity.` : "Out of stock. Please remove it."}</p> : null}
                <div className="flex items-center gap-4 pt-2">
                  <form action={updateCartLineAction} className="flex items-center gap-2">
                    <input type="hidden" name="variantId" value={l.variantId} />
                    <label htmlFor={`q-${l.variantId}`} className="sr-only">Quantity for {l.name}</label>
                    <input id={`q-${l.variantId}`} name="quantity" type="number" min={1} max={10} defaultValue={l.quantity} className="min-h-10 w-16 rounded-sm border border-taupe px-2" />
                    <button className="min-h-10 px-2 underline">Update</button>
                  </form>
                  <form action={removeCartLineAction}>
                    <input type="hidden" name="variantId" value={l.variantId} />
                    <button className="min-h-10 px-2 text-cocoa underline">Remove</button>
                  </form>
                </div>
              </div>
              <p className="text-sm font-medium">{formatPaise(paise(l.linePricePaise))}</p>
            </li>
          ))}
        </ul>
      </section>
      <aside className="h-fit space-y-4 border border-beige bg-white p-6" aria-labelledby="sum-h">
        <h2 id="sum-h" className="text-2xl">Summary</h2>
        <p className="flex justify-between"><span>Subtotal</span><span className="font-medium">{formatPaise(paise(cart.subtotalPaise))}</span></p>
        <p className="text-xs text-cocoa">Shipping and any applicable taxes are confirmed at checkout.</p>
        {cart.hasProblems ? (
          <p className="text-sm text-danger" role="alert">Fix the items marked above to continue.</p>
        ) : (
          <Link href="/checkout" className="flex min-h-11 items-center justify-center bg-espresso text-sm text-ivory hover:bg-cocoa">Checkout</Link>
        )}
        <Link href="/shop" className="block text-center text-sm underline">Continue shopping</Link>
      </aside>
    </div>
  );
}
