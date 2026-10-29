import "server-only";
import { getPrisma } from "@tanvi/database";
import { cookies } from "next/headers";
import { cache } from "react";
import { createCart, createWishlist, findCartByToken, findWishlistByToken, viewCart } from "./cart/service";

const CART_COOKIE = "tanvi_cart";
const WISHLIST_COOKIE = "tanvi_wishlist";
const secure = process.env.NODE_ENV === "production";

const opts = (days: number) => ({ httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: days * 86_400 });

/** Read-only (safe in server components). */
export const peekCartId = cache(async (): Promise<string | null> => {
  const token = (await cookies()).get(CART_COOKIE)?.value;
  if (!token) return null;
  return (await findCartByToken(getPrisma(), token))?.id ?? null;
});

/** For server actions only: creates the cart + cookie if missing. */
export async function ensureCartId(): Promise<string> {
  const jar = await cookies();
  const token = jar.get(CART_COOKIE)?.value;
  if (token) {
    const cart = await findCartByToken(getPrisma(), token);
    if (cart) return cart.id;
  }
  const created = await createCart(getPrisma());
  jar.set(CART_COOKIE, created.token, opts(30));
  return created.id;
}

export const peekCartCount = cache(async (): Promise<number> => {
  const id = await peekCartId();
  if (!id) return 0;
  const sum = await getPrisma().cartItem.aggregate({ where: { cartId: id }, _sum: { quantity: true } });
  return sum._sum.quantity ?? 0;
});

export async function peekCartView() {
  const id = await peekCartId();
  return id ? viewCart(getPrisma(), id) : null;
}

export const peekWishlistId = cache(async (): Promise<string | null> => {
  const token = (await cookies()).get(WISHLIST_COOKIE)?.value;
  if (!token) return null;
  return (await findWishlistByToken(getPrisma(), token))?.id ?? null;
});

export async function ensureWishlistId(): Promise<string> {
  const jar = await cookies();
  const token = jar.get(WISHLIST_COOKIE)?.value;
  if (token) {
    const w = await findWishlistByToken(getPrisma(), token);
    if (w) return w.id;
  }
  const created = await createWishlist(getPrisma());
  jar.set(WISHLIST_COOKIE, created.token, opts(180));
  return created.id;
}

export async function clearCartCookie(): Promise<void> {
  (await cookies()).delete(CART_COOKIE);
}
