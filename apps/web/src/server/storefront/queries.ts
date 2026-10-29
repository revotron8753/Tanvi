import type { Prisma, PrismaClient } from "@tanvi/database";
import { contentDataSchema, type ContentData } from "@tanvi/validation";
import { classifyAvailability, type Availability } from "../catalog/inventory";

/** Visible-to-customers filter: published product in a published category. The single definition. */
export const LIVE: Prisma.ProductWhereInput = { status: "PUBLISHED", category: { isPublished: true } };

export const SORTS = ["newest", "price_asc", "price_desc"] as const;
export type Sort = (typeof SORTS)[number];

export interface ShopQuery {
  categorySlug?: string | undefined;
  q?: string | undefined;
  sizes?: string[] | undefined;
  colours?: string[] | undefined;
  fabric?: string | undefined;
  minPaise?: number | undefined;
  maxPaise?: number | undefined;
  sort?: Sort | undefined;
  page: number;
  pageSize: number;
  featured?: boolean;
  newArrival?: boolean;
}

const orderBy = (s: Sort | undefined): Prisma.ProductOrderByWithRelationInput[] =>
  s === "price_asc" ? [{ pricePaise: "asc" }, { id: "asc" }] : s === "price_desc" ? [{ pricePaise: "desc" }, { id: "asc" }] : [{ publishedAt: "desc" }, { id: "asc" }];

export function shopWhere(q: ShopQuery): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [LIVE];
  if (q.categorySlug) and.push({ category: { slug: q.categorySlug } });
  if (q.q) {
    const term = q.q.slice(0, 80);
    and.push({
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
        { fabric: { contains: term, mode: "insensitive" } },
        { pattern: { contains: term, mode: "insensitive" } },
        { parentCode: { contains: term, mode: "insensitive" } },
        { category: { name: { contains: term, mode: "insensitive" } } },
      ],
    });
  }
  if (q.fabric) and.push({ fabric: { equals: q.fabric, mode: "insensitive" } });
  if (q.minPaise !== undefined) and.push({ pricePaise: { gte: q.minPaise } });
  if (q.maxPaise !== undefined) and.push({ pricePaise: { lte: q.maxPaise } });
  if (q.sizes?.length) and.push({ variants: { some: { isActive: true, size: { in: q.sizes } } } });
  if (q.colours?.length) and.push({ variants: { some: { isActive: true, colour: { in: q.colours } } } });
  if (q.featured) and.push({ isFeatured: true });
  if (q.newArrival) and.push({ isNewArrival: true });
  return { AND: and };
}

const cardInclude = {
  images: { orderBy: { position: "asc" as const }, take: 2 },
  category: { select: { name: true, slug: true } },
  variants: { where: { isActive: true }, include: { balances: true } },
} satisfies Prisma.ProductInclude;

export type ProductCardData = Prisma.ProductGetPayload<{ include: typeof cardInclude }> & { availability: Availability };

function withAvailability<T extends { variants: { balances: { onHand: number; reserved: number; lowStockThreshold: number }[] }[] }>(p: T): T & { availability: Availability } {
  return { ...p, availability: classifyAvailability(p.variants.flatMap((v) => v.balances)).status };
}

export async function listShopProducts(prisma: PrismaClient, q: ShopQuery): Promise<{ total: number; items: ProductCardData[] }> {
  const where = shopWhere(q);
  const [total, items] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, orderBy: orderBy(q.sort), skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: cardInclude }),
  ]);
  return { total, items: items.map(withAvailability) };
}

export async function shopFacets(prisma: PrismaClient, categorySlug?: string) {
  const where: Prisma.ProductWhereInput = { AND: [LIVE, categorySlug ? { category: { slug: categorySlug } } : {}] };
  const [variants, fabrics, price] = await Promise.all([
    prisma.productVariant.findMany({ where: { isActive: true, product: where }, select: { size: true, colour: true }, distinct: ["size", "colour"], take: 500 }),
    prisma.product.findMany({ where: { AND: [where, { fabric: { not: null } }] }, select: { fabric: true }, distinct: ["fabric"], take: 100 }),
    prisma.product.aggregate({ where, _min: { pricePaise: true }, _max: { pricePaise: true } }),
  ]);
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return {
    sizes: uniq(variants.map((v) => v.size)),
    colours: uniq(variants.map((v) => v.colour)),
    fabrics: uniq(fabrics.map((f) => f.fabric ?? "")).filter(Boolean),
    minPaise: price._min.pricePaise,
    maxPaise: price._max.pricePaise,
  };
}

export async function getLiveCategories(prisma: PrismaClient) {
  return prisma.category.findMany({ where: { isPublished: true }, orderBy: { displayOrder: "asc" } });
}

export async function getLiveProductBySlug(prisma: PrismaClient, slug: string) {
  return prisma.product.findFirst({
    where: { AND: [LIVE, { slug }] },
    include: {
      images: { orderBy: { position: "asc" } },
      category: true,
      variants: { where: { isActive: true }, orderBy: [{ size: "asc" }, { colour: "asc" }], include: { balances: true } },
    },
  });
}

export async function getRelated(prisma: PrismaClient, productId: string, categoryId: string): Promise<ProductCardData[]> {
  const items = await prisma.product.findMany({
    where: { AND: [LIVE, { categoryId }, { id: { not: productId } }] },
    orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }],
    take: 4,
    include: cardInclude,
  });
  return items.map(withAvailability);
}

export async function getHomepageData(prisma: PrismaClient) {
  const [categories, newArrivals, featured] = await Promise.all([
    getLiveCategories(prisma),
    listShopProducts(prisma, { newArrival: true, page: 1, pageSize: 8, sort: "newest" }),
    listShopProducts(prisma, { featured: true, page: 1, pageSize: 8, sort: "newest" }),
  ]);
  return { categories, newArrivals: newArrivals.items, featured: featured.items };
}

export async function getContent(prisma: PrismaClient, key: string): Promise<ContentData | null> {
  const row = await prisma.websiteContent.findUnique({ where: { key } });
  if (!row) return null;
  const parsed = contentDataSchema.safeParse(row.data);
  if (!parsed.success) return null;
  const hasAny = Object.values(parsed.data).some((v) => typeof v === "string" && v.trim() !== "");
  return hasAny ? parsed.data : null;
}

/** Variant unit price: override if set, else the product price. Integer paise. */
export const unitPrice = (product: { pricePaise: number }, variant: { pricePaise: number | null }): number => variant.pricePaise ?? product.pricePaise;
