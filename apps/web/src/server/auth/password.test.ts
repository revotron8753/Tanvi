import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "./password";

describe("password", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "correct horse battery")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
  });
  it("returns false (not throw) for a malformed hash", async () => {
    expect(await verifyPassword("garbage", "x")).toBe(false);
  });
  it("enforces policy", () => {
    expect(passwordProblem("short")).not.toBeNull();
    expect(passwordProblem("aaaaaaaaaaaaaa")).not.toBeNull();
    expect(passwordProblem("a perfectly fine passphrase")).toBeNull();
  });
});
