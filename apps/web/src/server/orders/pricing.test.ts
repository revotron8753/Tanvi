import { describe, expect, it } from "vitest";
import { allocateDiscount, computeTotals, divRound, evaluateCoupon, lineTax, splitGst, type CouponRule } from "./pricing";

const ship = { shippingFlatPaise: 9900, freeShippingThresholdPaise: 200000, codFeePaise: 5000 };
const line = (price: number, qty = 1, gst: number | null = 500) => ({ variantId: "v", unitPricePaise: price, quantity: qty, gstRateBps: gst });
const coupon = (over: Partial<CouponRule> = {}): CouponRule => ({ code: "X", type: "PERCENT", value: 1000, minSubtotalPaise: 0, maxDiscountPaise: null, startsAt: null, endsAt: null, maxUses: null, usedCount: 0, isActive: true, ...over });

describe("pricing", () => {
  it("rounds half up with integers", () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(4, 3)).toBe(1);
    expect(divRound(0, 7)).toBe(0);
  });

  it("discount allocation always sums exactly to the discount", () => {
    for (const [lines, d] of [[[100, 100, 100], 100], [[333, 667], 1], [[1, 1, 1, 1], 3], [[99999, 1], 5000]] as const) {
      const parts = allocateDiscount(lines, d);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(d);
      parts.forEach((p, i) => expect(p).toBeLessThanOrEqual(lines[i] ?? 0));
    }
    expect(allocateDiscount([100, 200], 0)).toEqual([0, 0]);
  });

  it("GST inclusive extracts tax from the price; exclusive adds it", () => {
    expect(lineTax(105000, 500, "INCLUSIVE")).toBe(5000); // 1,050 incl 5% → 50 tax
    expect(lineTax(100000, 500, "EXCLUSIVE")).toBe(5000);
    expect(lineTax(100000, 1200, "INCLUSIVE")).toBe(10714);
    expect(lineTax(100000, 500, "UNSET")).toBe(0);
    expect(lineTax(100000, null, "INCLUSIVE")).toBe(0);
  });

  it("inclusive: total equals subtotal − discount + shipping; tax is informational", () => {
    const t = computeTotals({ lines: [line(105000)], taxMode: "INCLUSIVE", couponDiscountPaise: 0, shipping: ship, cod: false });
    expect(t).toMatchObject({ subtotalPaise: 105000, taxPaise: 5000, shippingPaise: 9900, totalPaise: 114900 });
  });

  it("exclusive: tax is added to the total", () => {
    const t = computeTotals({ lines: [line(100000)], taxMode: "EXCLUSIVE", couponDiscountPaise: 0, shipping: ship, cod: false });
    expect(t.totalPaise).toBe(100000 + 5000 + 9900);
  });

  it("unset tax computes no tax at all", () => {
    const t = computeTotals({ lines: [line(100000, 2)], taxMode: "UNSET", couponDiscountPaise: 0, shipping: ship, cod: false });
    expect(t.taxPaise).toBe(0);
    expect(t.totalPaise).toBe(200000);
  });

  it("free shipping is judged after discount; COD fee only for COD", () => {
    const base = { lines: [line(210000)], taxMode: "UNSET" as const, shipping: ship };
    expect(computeTotals({ ...base, couponDiscountPaise: 0, cod: false }).shippingPaise).toBe(0);
    expect(computeTotals({ ...base, couponDiscountPaise: 20000, cod: false }).shippingPaise).toBe(9900);
    expect(computeTotals({ ...base, couponDiscountPaise: 0, cod: true }).totalPaise).toBe(215000);
  });

  it("tax is computed on the discounted amount", () => {
    const t = computeTotals({ lines: [line(100000), line(100000)], taxMode: "EXCLUSIVE", couponDiscountPaise: 50000, shipping: { shippingFlatPaise: 0, freeShippingThresholdPaise: null, codFeePaise: 0 }, cod: false });
    expect(t.taxPaise).toBe(7500); // 5% of 150,000
    expect(t.totalPaise).toBe(150000 + 7500);
    expect(t.lines.reduce((s, l) => s + l.discountPaise, 0)).toBe(50000);
  });

  it("evaluates coupons", () => {
    const now = new Date("2026-10-29T00:00:00Z");
    expect(evaluateCoupon(coupon(), 100000, now)).toEqual({ ok: true, discountPaise: 10000 });
    expect(evaluateCoupon(coupon({ maxDiscountPaise: 5000 }), 100000, now)).toEqual({ ok: true, discountPaise: 5000 });
    expect(evaluateCoupon(coupon({ type: "FIXED", value: 999999 }), 50000, now)).toEqual({ ok: true, discountPaise: 50000 });
    expect(evaluateCoupon(coupon({ isActive: false }), 100000, now).ok).toBe(false);
    expect(evaluateCoupon(coupon({ endsAt: new Date("2026-01-01") }), 100000, now).ok).toBe(false);
    expect(evaluateCoupon(coupon({ startsAt: new Date("2027-01-01") }), 100000, now).ok).toBe(false);
    expect(evaluateCoupon(coupon({ maxUses: 3, usedCount: 3 }), 100000, now).ok).toBe(false);
    expect(evaluateCoupon(coupon({ minSubtotalPaise: 200000 }), 100000, now).ok).toBe(false);
  });

  it("splits GST", () => {
    expect(splitGst(5001, true)).toEqual({ cgst: 2500, sgst: 2501, igst: 0 });
    expect(splitGst(5001, false)).toEqual({ cgst: 0, sgst: 0, igst: 5001 });
  });
});
