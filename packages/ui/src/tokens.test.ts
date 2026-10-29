import { describe, expect, it } from "vitest";
import { AA_NORMAL, allowedTextPairs, colors, contrastRatio } from "./tokens";

describe("design tokens: WCAG AA", () => {
  it.each(allowedTextPairs)("%s on %s meets 4.5:1", (fg, bg) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("documents that Sand and Taupe are NOT usable as text on Ivory", () => {
    expect(contrastRatio(colors.sand, colors.ivory)).toBeLessThan(AA_NORMAL);
    expect(contrastRatio(colors.taupe, colors.ivory)).toBeLessThan(AA_NORMAL);
    expect(contrastRatio(colors.champagne, colors.ivory)).toBeLessThan(AA_NORMAL);
  });
});
