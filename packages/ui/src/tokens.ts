/** Brand colour tokens (SPEC §3). Single source; CSS variables are generated from these in styles/tokens.css. */
export const colors = {
  ivory: "#FAF7F2",
  beige: "#E8DCCB",
  sand: "#D4BEA5",
  taupe: "#B5A18B",
  cocoa: "#785744",
  espresso: "#38271F",
  champagne: "#C5A477",
  white: "#FFFFFF",
} as const;

export type ColorToken = keyof typeof colors;

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG 2.1 contrast ratio between two #RRGGBB colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

/**
 * Foreground/background pairs the design system permits for TEXT. The test suite asserts each meets AA (4.5:1),
 * so adding a pair here without sufficient contrast fails CI.
 */
export const allowedTextPairs: ReadonlyArray<readonly [fg: ColorToken, bg: ColorToken]> = [
  ["espresso", "ivory"],
  ["espresso", "white"],
  ["espresso", "beige"],
  ["espresso", "sand"],
  ["espresso", "champagne"],
  ["cocoa", "ivory"],
  ["cocoa", "white"],
  ["ivory", "espresso"],
  ["ivory", "cocoa"],
  ["white", "espresso"],
  ["white", "cocoa"],
];
