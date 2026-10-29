import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("normalises", () => {
    expect(slugify("Anarkali  Kurti — Rose & Gold!")).toBe("anarkali-kurti-rose-and-gold");
    expect(slugify("Café Straight")).toBe("cafe-straight");
    expect(slugify("  --  ")).toBe("");
  });
});
