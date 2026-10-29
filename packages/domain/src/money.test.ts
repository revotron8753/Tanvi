import { describe, expect, it } from "vitest";
import { addPaise, formatPaise, multiplyPaise, paise } from "./money";

describe("money", () => {
  it("rejects non-integers", () => {
    expect(() => paise(10.5)).toThrow(RangeError);
    expect(() => paise(Number.NaN)).toThrow(RangeError);
  });
  it("formats with Indian grouping", () => {
    expect(formatPaise(paise(12345600))).toBe("₹1,23,456");
    expect(formatPaise(paise(99900))).toBe("₹999");
    expect(formatPaise(paise(0))).toBe("₹0");
  });
  it("shows paise only when present", () => {
    expect(formatPaise(paise(123456))).toBe("₹1,234.56");
    expect(formatPaise(paise(5))).toBe("₹0.05");
  });
  it("formats negatives", () => {
    expect(formatPaise(paise(-50000))).toBe("-₹500");
  });
  it("does integer arithmetic", () => {
    expect(addPaise(paise(10), paise(20))).toBe(30);
    expect(multiplyPaise(paise(19900), 3)).toBe(59700);
    expect(() => multiplyPaise(paise(100), 1.5)).toThrow();
  });
});
