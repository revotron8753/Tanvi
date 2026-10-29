import { describe, expect, it } from "vitest";
import { publishProblems } from "./publish";

const ok = { name: "Rose Kurti", slug: "rose-kurti", categoryPublished: true, pricePaise: 199900, imageCount: 1, imagesMissingAlt: 0, activeVariantCount: 1, hsnCode: null };

describe("publishProblems", () => {
  it("passes a complete product", () => expect(publishProblems(ok)).toEqual([]));
  it("reports each missing essential", () => {
    expect(publishProblems({ ...ok, imageCount: 0 })).toContain("Upload at least one image.");
    expect(publishProblems({ ...ok, pricePaise: 0 })).toHaveLength(1);
    expect(publishProblems({ ...ok, activeVariantCount: 0 })).toHaveLength(1);
    expect(publishProblems({ ...ok, categoryPublished: false })).toHaveLength(1);
    expect(publishProblems({ ...ok, imagesMissingAlt: 2 })).toHaveLength(1);
  });
});
