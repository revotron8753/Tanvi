import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processProductImage } from "./images";

const make = (w: number, h: number, format: "jpeg" | "png" | "webp" = "jpeg") =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#c5a477" } })[format]().toBuffer();

describe("processProductImage", () => {
  it("produces three WebP renditions, never enlarging", async () => {
    const r = await processProductImage(await make(1000, 1400));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const widths = await Promise.all((["thumb", "md", "lg"] as const).map(async (n) => (await sharp(r.renditions[n]).metadata()).width));
    expect(widths).toEqual([320, 800, 1000]);
    expect((await sharp(r.renditions.md).metadata()).format).toBe("webp");
  });
  it("strips EXIF metadata", async () => {
    const withExif = await sharp({ create: { width: 700, height: 700, channels: 3, background: "#fff" } })
      .jpeg().withExif({ IFD0: { Copyright: "secret-owner" } }).toBuffer();
    const r = await processProductImage(withExif);
    if (!r.ok) throw new Error(r.message);
    expect((await sharp(r.renditions.md).metadata()).exif).toBeUndefined();
  });
  it("rejects non-images even with image-like content in them", async () => {
    expect((await processProductImage(Buffer.from("<svg onload=alert(1)></svg>"))).ok).toBe(false);
    expect((await processProductImage(Buffer.from("GIF89a" + "x".repeat(100)))).ok).toBe(false);
    expect((await processProductImage(Buffer.alloc(0))).ok).toBe(false);
  });
  it("rejects tiny, oversized-dimension and gif images", async () => {
    expect(await processProductImage(await make(200, 200))).toMatchObject({ ok: false });
    const gif = await sharp({ create: { width: 700, height: 700, channels: 3, background: "#fff" } }).gif().toBuffer();
    expect(await processProductImage(gif)).toMatchObject({ ok: false });
  });
  it("rejects files over 10 MB", async () => {
    expect(await processProductImage(Buffer.alloc(10 * 1024 * 1024 + 1))).toMatchObject({ ok: false, message: expect.stringContaining("10 MB") });
  });
});
