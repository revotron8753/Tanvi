import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, totpAt, verifyTotp } from "./totp";

// RFC 6238 Appendix B (SHA-1), secret "12345678901234567890", 8 digits.
const secret = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
  it("matches RFC 6238 test vectors", () => {
    expect(totpAt(secret, 59_000, 8)).toBe("94287082");
    expect(totpAt(secret, 1111111109_000, 8)).toBe("07081804");
    expect(totpAt(secret, 1234567890_000, 8)).toBe("89005924");
  });
  it("round-trips base32", () => {
    const buf = Buffer.from("hello world");
    expect(base32Decode(base32Encode(buf)).toString()).toBe("hello world");
  });
  it("verifies within ±1 step and rejects others", () => {
    const now = 1_700_000_000_000;
    const code = totpAt(secret, now);
    expect(verifyTotp(secret, code, now)).not.toBeNull();
    expect(verifyTotp(secret, code, now + 30_000)).not.toBeNull();
    expect(verifyTotp(secret, code, now + 120_000)).toBeNull();
    expect(verifyTotp(secret, "abcdef", now)).toBeNull();
  });
});
