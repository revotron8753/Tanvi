import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";

describe("csv", () => {
  it("round-trips quotes, commas and newlines", () => {
    const rows = [["a,b", 'say "hi"', "line1\nline2", ""]];
    expect(parseCsv(toCsv(rows))).toEqual([["a,b", 'say "hi"', "line1\nline2", ""]]);
  });
  it("handles BOM, CRLF and blank lines", () => {
    expect(parseCsv("﻿a,b\r\n\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("neutralises formula injection", () => {
    expect(toCsv([["=HYPERLINK(\"x\")", "+1", "-2", "@x", "ok"]])).toBe(`'=HYPERLINK(""x"")`.replace(/^/, '"') .replace(/$/, '"') + ",'+1,'-2,'@x,ok\r\n");
  });
});
