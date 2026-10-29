import type { PrismaClient } from "@tanvi/database";
import { randomBytes, createHash } from "node:crypto";
import { classifyAvailability } from "../catalog/inventory";
import { LIVE, unitPrice } from "../storefront/queries";

export const MAX_QTY_PER_LINE = 10;
const CART_TTL_DAYS = 30;

export const hashToken = (t: string): string => createHash("sha256").update(t).digest("hex");
export const newToken = (): string => randomBytes(32).toString("base64url");

export type CartResult = { ok: true } | { ok: false; message: string };

export async function createCart(prisma: PrismaClient): Promise<{ id: string; token: string }> {
  const token = newToken();
  const cart = await prisma.cart.create({ data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + CART_TTL_DAYS * 86_400_000) } });
  return { id: cart.id, token };
}

export async function findCartByToken(prisma: PrismaClient, token: string) {
  const cart = await prisma.cart.findUnique({ where: { tokenHash: hashToken(token) } });
  return cart && cart.expiresAt > new Date() ? cart : null;
}

async function availableFor(prisma: PrismaClient, variantId: string): Promise<{ live: boolean; available: number }> {
  const v = await prisma.productVariant.findFirst({
    where: { id: variantId, isActive: true, product: LIVE },
    include: { balances: { where: { location: { isActive: true } } } },
  });
  return v ? { live: true, available: classifyAvailability(v.balances).available } : { live: false, available: 0 };
}

export async function addToCart(prisma: PrismaClient, cartId: string, variantId: string, quantity: number): Promise<CartResult> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY_PER_LINE) return { ok: false, message: `Choose a quantity between 1 and ${MAX_QTY_PER_LINE}.` };
  const { live, available } = await availableFor(prisma, variantId);
  if (!live) return { ok: false, message: "This item is no longer available." };
  const existing = await prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
  const next = (existing?.quantity ?? 0) + quantity;
  if (next > MAX_QTY_PER_LINE) return { ok: false, message: `You can order up to ${MAX_QTY_PER_LINE} of one item online.` };
  if (next > available) return { ok: false, message: available <= 0 ? "Sorry, this size is out of stock." : `Only ${available} left in this size.` };
  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId, variantId } },
    update: { quantity: next },
    create: { cartId, variantId, quantity },
  });
  await prisma.cart.update({ where: { id: cartId }, data: { expiresAt: new Date(Date.now() + CART_TTL_DAYS * 86_400_000) } });
  return { ok: true };
}

export async function setCartQuantity(prisma: PrismaClient, cartId: string, variantId: string, quantity: number): Promise<CartResult> {
  if (quantity === 0) return removeFromCart(prisma, cartId, variantId);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY_PER_LINE) return { ok: false, message: `Choose a quantity between 1 and ${MAX_QTY_PER_LINE}.` };
  const { live, available } = await availableFor(prisma, variantId);
  if (!live) return { ok: false, message: "This item is no longer available." };
  if (quantity > available) return { ok: false, message: available <= 0 ? "Sorry, this size is out of stock." : `Only ${available} left in this size.` };
  const n = await prisma.cartItem.updateMany({ where: { cartId, variantId }, data: { quantity } });
  return n.count ? { ok: true } : { ok: false, message: "That item is not in your cart." };
}

export async function removeFromCart(prisma: PrismaClient, cartId: string, variantId: string): Promise<CartResult> {
  await prisma.cartItem.deleteMany({ where: { cartId, variantId } });
  return { ok: true };
}

export interface CartLine {
  variantId: string;
  productId: string;
  productSlug: string;
  name: string;
  sku: string;
  size: string;
  colour: string;
  quantity: number;
  unitPricePaise: number;
  linePricePaise: number;
  imageKey: string | null;
  imageAlt: string;
  /** Present when the line cannot currently be bought as-is. */
  problem: "unavailable" | "insufficient" | null;
  available: number;
}

export interface CartView {
  lines: CartLine[];
  itemCount: number;
  /** Sum of line prices for lines without problems. Server-calculated integer paise. */
  subtotalPaise: number;
  hasProblems: boolean;
}

/** The single place cart prices are computed. Never trust anything the browser sends. */
export async function viewCart(prisma: PrismaClient, cartId: string): Promise<CartView> {
  const items = await prisma.cartItem.findMany({
    where: { cartId },
    orderBy: { createdAt: "asc" },
    include: {
      variant: {
        include: {
          product: { include: { category: { select: { isPublished: true } }, images: { orderBy: { position: "asc" }, take: 1 } } },
          balances: { where: { location: { isActive: true } } },
        },
      },
    },
  });
  const lines: CartLine[] = items.map((i) => {
    const v = i.variant;
    const live = v.isActive && v.product.status === "PUBLISHED" && v.product.category.isPublished;
    const available = live ? classifyAvailability(v.balances).available : 0;
    const price = unitPrice(v.product, v);
    return {
      variantId: v.id,
      productId: v.product.id,
      productSlug: v.product.slug,
      name: v.product.name,
      sku: v.sku,
      size: v.size,
      colour: v.colour,
      quantity: i.quantity,
      unitPricePaise: price,
      linePricePaise: price * i.quantity,
      imageKey: v.product.images[0]?.storageKey ?? null,
      imageAlt: v.product.images[0]?.altText ?? v.product.name,
      problem: !live ? "unavailable" : i.quantity > available ? "insufficient" : null,
      available,
    };
  });
  const ok = lines.filter((l) => !l.problem);
  return {
    lines,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    subtotalPaise: ok.reduce((s, l) => s + l.linePricePaise, 0),
    hasProblems: lines.some((l) => l.problem),
  };
}

// ---------- wishlist ----------

export async function createWishlist(prisma: PrismaClient): Promise<{ id: string; token: string }> {
  const token = newToken();
  const w = await prisma.wishlist.create({ data: { tokenHash: hashToken(token) } });
  return { id: w.id, token };
}

export async function findWishlistByToken(prisma: PrismaClient, token: string) {
  return prisma.wishlist.findUnique({ where: { tokenHash: hashToken(token) } });
}

export async function toggleWishlist(prisma: PrismaClient, wishlistId: string, productId: string): Promise<{ saved: boolean }> {
  const key = { wishlistId_productId: { wishlistId, productId } };
  if (await prisma.wishlistItem.findUnique({ where: key })) {
    await prisma.wishlistItem.delete({ where: key });
    return { saved: false };
  }
  const live = await prisma.product.findFirst({ where: { AND: [LIVE, { id: productId }] }, select: { id: true } });
  if (!live) return { saved: false };
  const count = await prisma.wishlistItem.count({ where: { wishlistId } });
  if (count >= 100) return { saved: false };
  await prisma.wishlistItem.create({ data: { wishlistId, productId } });
  return { saved: true };
}
