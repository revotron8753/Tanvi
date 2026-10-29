import type { PrismaClient } from "@tanvi/database";

/**
 * Metric definitions (shown on the report page so nobody has to guess):
 *  - Orders placed: orders created in the range, excluding cancelled.
 *  - Paid sales: sum of order totals (incl. shipping, COD fee and any exclusive tax) where payment status is PAID,
 *    for orders created in the range. COD orders count once the cash is recorded at delivery.
 *  - Average paid order: Paid sales / paid orders.
 *  - Awaiting payment: online orders still PENDING_PAYMENT. Refunds due: orders flagged REFUND_DUE.
 *  - Units sold: quantities on non-cancelled orders in the range.
 * Ranges are whole IST calendar days: [from 00:00 IST, to+1 00:00 IST).
 */
export interface DateRange {
  from: Date;
  toExclusive: Date;
  fromText: string;
  toText: string;
}

const IST_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseRange(from: string | undefined, to: string | undefined, now = new Date()): DateRange {
  const ist = (d: string) => new Date(`${d}T00:00:00+05:30`);
  const todayIst = new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const defaultFrom = new Date(ist(todayIst).getTime() - 29 * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const f = from && IST_DAY.test(from) && !Number.isNaN(ist(from).getTime()) ? from : defaultFrom;
  const t = to && IST_DAY.test(to) && !Number.isNaN(ist(to).getTime()) ? to : todayIst;
  const [a, b] = f <= t ? [f, t] : [t, f];
  return { from: ist(a), toExclusive: new Date(ist(b).getTime() + 86_400_000), fromText: a, toText: b };
}

export async function salesSummary(prisma: PrismaClient, r: DateRange) {
  const inRange = { createdAt: { gte: r.from, lt: r.toExclusive } };
  const [placed, cancelled, paid, pending, refundDue, units, top] = await Promise.all([
    prisma.order.count({ where: { ...inRange, status: { not: "CANCELLED" } } }),
    prisma.order.count({ where: { ...inRange, status: "CANCELLED" } }),
    prisma.order.aggregate({ where: { ...inRange, paymentStatus: "PAID", status: { not: "CANCELLED" } }, _sum: { totalPaise: true }, _count: true }),
    prisma.order.count({ where: { status: "PENDING_PAYMENT" } }),
    prisma.order.count({ where: { paymentStatus: "REFUND_DUE" } }),
    prisma.orderItem.aggregate({ where: { order: { ...inRange, status: { not: "CANCELLED" } } }, _sum: { quantity: true } }),
    prisma.orderItem.groupBy({ by: ["name"], where: { order: { ...inRange, status: { not: "CANCELLED" } } }, _sum: { quantity: true, unitPricePaise: true }, orderBy: { _sum: { quantity: "desc" } }, take: 10 }),
  ]);
  const paidTotal = paid._sum.totalPaise ?? 0;
  return {
    ordersPlaced: placed,
    ordersCancelled: cancelled,
    paidOrders: paid._count,
    paidSalesPaise: paidTotal,
    averagePaidOrderPaise: paid._count > 0 ? Math.floor((paidTotal * 2 + paid._count) / (paid._count * 2)) : 0,
    awaitingPayment: pending,
    refundsDue: refundDue,
    unitsSold: units._sum.quantity ?? 0,
    topProducts: top.map((t) => ({ name: t.name, units: t._sum.quantity ?? 0 })),
  };
}

export async function lowStockCount(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "InventoryBalance" b
    JOIN "ProductVariant" v ON v."id" = b."variantId" AND v."isActive"
    JOIN "Product" p ON p."id" = v."productId" AND p."status" = 'PUBLISHED'
    WHERE b."onHand" - b."reserved" <= b."lowStockThreshold"`;
  return Number(rows[0]?.n ?? 0);
}
