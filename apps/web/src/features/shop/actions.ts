"use server";

import { getPrisma } from "@tanvi/database";
import { newsletterSchema } from "@tanvi/validation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { NEWSLETTER_CONSENT_TEXT } from "./consent";
import { reviewInputSchema, submitReview } from "@/server/community/service";
import { addToCart, removeFromCart, setCartQuantity, toggleWishlist } from "@/server/cart/service";
import { ensureCartId, ensureWishlistId, peekCartId } from "@/server/shopper";

const uuid = z.string().uuid();

export async function addToCartAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const variantId = uuid.safeParse(form.get("variantId"));
  if (!variantId.success) return { error: "Please choose a size and colour." };
  const qty = Number(form.get("quantity") ?? 1);
  const res = await addToCart(getPrisma(), await ensureCartId(), variantId.data, qty);
  if (!res.ok) return { error: res.message };
  revalidatePath("/", "layout");
  return { ok: "Added to your bag." };
}

export async function updateCartLineAction(form: FormData): Promise<void> {
  const cartId = await peekCartId();
  const variantId = uuid.safeParse(form.get("variantId"));
  if (!cartId || !variantId.success) return;
  await setCartQuantity(getPrisma(), cartId, variantId.data, Number(form.get("quantity")));
  revalidatePath("/", "layout");
}

export async function removeCartLineAction(form: FormData): Promise<void> {
  const cartId = await peekCartId();
  const variantId = uuid.safeParse(form.get("variantId"));
  if (!cartId || !variantId.success) return;
  await removeFromCart(getPrisma(), cartId, variantId.data);
  revalidatePath("/", "layout");
}

export async function toggleWishlistAction(form: FormData): Promise<void> {
  const productId = uuid.safeParse(form.get("productId"));
  if (!productId.success) return;
  await toggleWishlist(getPrisma(), await ensureWishlistId(), productId.data);
  revalidatePath("/", "layout");
}

export async function newsletterAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const parsed = newsletterSchema.safeParse({ email: form.get("email"), consent: form.get("consent") });
  if (!parsed.success) return { error: "Enter a valid email and tick the box to agree." };
  const email = parsed.data.email.toLowerCase();
  const prisma = getPrisma();
  await prisma.newsletterSubscriber.upsert({
    where: { email },
    update: { unsubscribedAt: null },
    create: { email, consentText: NEWSLETTER_CONSENT_TEXT, source: "footer" },
  });
  return { ok: "Thank you. You're on the list." };
}

export async function submitReviewAction(_p: ActionState, form: FormData): Promise<ActionState> {
  // Hidden field that people never fill in; simple bots do.
  if (String(form.get("website") ?? "") !== "") return { ok: "Thank you. Your review will appear once we've read it." };
  const parsed = reviewInputSchema.safeParse({
    productId: form.get("productId"),
    authorName: form.get("authorName"),
    email: form.get("email"),
    rating: form.get("rating"),
    title: form.get("title") || undefined,
    body: form.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fields." };
  const res = await submitReview(getPrisma(), parsed.data);
  if (!res.ok) return { error: res.message };
  return { ok: "Thank you. Your review will appear once we've read it." };
}
