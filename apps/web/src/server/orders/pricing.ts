/**
 * Pure, integer-only order pricing. All amounts are paise. No floats, no rounding surprises:
 * every division uses a single documented rounding rule (round half up) via integer arithmetic.
 * Assumptions awaiting accountant sign-off (OPEN_QUESTIONS): shipping and COD fees carry no GST here.
 */
export type TaxMode = "UNSET" | "INCLUSIVE" | "EXCLUSIVE";

export interface PricedLineInput {
  variantId: string;
  unitPricePaise: number;
  quantity: number;
  gstRateBps: number | null;
}

export interface CouponRule {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  minSubtotalPaise: number;
  maxDiscountPaise: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
}

export interface ShippingRule {
  shippingFlatPaise: number;
  freeShippingThresholdPaise: number | null;
  codFeePaise: number;
}

export interface PricedLine extends PricedLineInput {
  lineTotalPaise: number;
  discountPaise: number;
  taxPaise: number;
}

export interface OrderTotals {
  lines: PricedLine[];
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  taxPaise: number;
  totalPaise: number;
}

/** floor((num * 2 + den) / (den * 2)): round-half-up integer division for non-negative values. */
export const divRound = (num: number, den: number): number => Math.floor((num * 2 + den) / (den * 2));

export type CouponCheck = { ok: true; discountPaise: number } | { ok: false; message: string };

export function evaluateCoupon(c: CouponRule, subtotalPaise: number, now: Date): CouponCheck {
  if (!c.isActive) return { ok: false, message: "This coupon is not active." };
  if (c.startsAt && now < c.startsAt) return { ok: false, message: "This coupon is not valid yet." };
  if (c.endsAt && now > c.endsAt) return { ok: false, message: "This coupon has expired." };
  if (c.maxUses !== null && c.usedCount >= c.maxUses) return { ok: false, message: "This coupon has been fully used." };
  if (subtotalPaise < c.minSubtotalPaise) return { ok: false, message: "Your bag is below the minimum for this coupon." };
  let d = c.type === "PERCENT" ? divRound(subtotalPaise * c.value, 10_000) : c.value;
  if (c.maxDiscountPaise !== null) d = Math.min(d, c.maxDiscountPaise);
  d = Math.min(d, subtotalPaise);
  return d > 0 ? { ok: true, discountPaise: d } : { ok: false, message: "This coupon gives no discount on your bag." };
}

/** Spreads `discount` across line totals proportionally; the remainder goes to the largest line, so the parts always sum exactly. */
export function allocateDiscount(lineTotals: readonly number[], discount: number): number[] {
  const total = lineTotals.reduce((a, b) => a + b, 0);
  if (total === 0 || discount === 0) return lineTotals.map(() => 0);
  const shares = lineTotals.map((t) => Math.floor((t * discount) / total));
  let remainder = discount - shares.reduce((a, b) => a + b, 0);
  const order = lineTotals.map((t, i) => [t, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) shares[order[k]?.[1] ?? 0] = (shares[order[k]?.[1] ?? 0] ?? 0) + 1;
  return shares;
}

export function lineTax(netPaise: number, rateBps: number | null, mode: TaxMode): number {
  if (mode === "UNSET" || rateBps === null || rateBps === 0) return 0;
  return mode === "INCLUSIVE" ? divRound(netPaise * rateBps, 10_000 + rateBps) : divRound(netPaise * rateBps, 10_000);
}

export function computeTotals(input: {
  lines: readonly PricedLineInput[];
  taxMode: TaxMode;
  couponDiscountPaise: number;
  shipping: ShippingRule;
  cod: boolean;
}): OrderTotals {
  const base = input.lines.map((l) => l.unitPricePaise * l.quantity);
  const subtotal = base.reduce((a, b) => a + b, 0);
  const discount = Math.min(input.couponDiscountPaise, subtotal);
  const allocation = allocateDiscount(base, discount);
  const lines: PricedLine[] = input.lines.map((l, i) => {
    const net = (base[i] ?? 0) - (allocation[i] ?? 0);
    return { ...l, lineTotalPaise: base[i] ?? 0, discountPaise: allocation[i] ?? 0, taxPaise: lineTax(net, l.gstRateBps, input.taxMode) };
  });
  const afterDiscount = subtotal - discount;
  const free = input.shipping.freeShippingThresholdPaise !== null && afterDiscount >= input.shipping.freeShippingThresholdPaise;
  const shippingPaise = free ? 0 : input.shipping.shippingFlatPaise;
  const codFeePaise = input.cod ? input.shipping.codFeePaise : 0;
  const tax = lines.reduce((s, l) => s + l.taxPaise, 0);
  const totalPaise = afterDiscount + shippingPaise + codFeePaise + (input.taxMode === "EXCLUSIVE" ? tax : 0);
  return { lines, subtotalPaise: subtotal, discountPaise: discount, shippingPaise, codFeePaise, taxPaise: tax, totalPaise };
}

/** Splits a tax amount for an invoice: same state → CGST+SGST halves, different → IGST. */
export function splitGst(taxPaise: number, sameState: boolean): { cgst: number; sgst: number; igst: number } {
  if (!sameState) return { cgst: 0, sgst: 0, igst: taxPaise };
  const cgst = Math.floor(taxPaise / 2);
  return { cgst, sgst: taxPaise - cgst, igst: 0 };
}
