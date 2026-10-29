/** Money is always integer paise. Never floats. */
export type Paise = number & { readonly __brand: "Paise" };

export function paise(value: number): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Money must be an integer number of paise, got ${value}`);
  }
  return value as Paise;
}

export function addPaise(a: Paise, b: Paise): Paise {
  return paise(a + b);
}

export function subtractPaise(a: Paise, b: Paise): Paise {
  return paise(a - b);
}

export function multiplyPaise(a: Paise, quantity: number): Paise {
  if (!Number.isSafeInteger(quantity)) throw new RangeError("Quantity must be an integer");
  return paise(a * quantity);
}

const rupeeFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
/** Formats paise as Indian-grouped rupees, e.g. ₹1,23,456. Shows paise only when non-zero. No float arithmetic. */
export function formatPaise(value: Paise): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.trunc(abs / 100);
  const rem = abs % 100;
  const text = rupeeFormatter.format(whole) + (rem === 0 ? "" : `.${String(rem).padStart(2, "0")}`);
  return negative ? `-${text}` : text;
}

/**
 * Parses a rupee amount typed by a person ("1999", "1,999.50") into integer paise using string
 * operations only (no floats). Returns null when the text is not a valid non-negative amount with ≤ 2 decimals.
 */
export function parseRupeesToPaise(input: string): Paise | null {
  const text = input.trim().replace(/^₹\s*/, "").replace(/,/g, "");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? "").padEnd(2, "0"));
  return paise(whole * 100 + frac);
}
