import sharp from "sharp";

export const TRYON_MAX_BYTES = 8 * 1024 * 1024;
export const TRYON_MIN_SIDE = 256;

export type TryOnInput = { ok: true; image: Buffer } | { ok: false; message: string };

/** Provider requirements are unknown; these are conservative generic limits. Output is a metadata-free JPEG. */
export async function processTryOnInput(raw: Buffer): Promise<TryOnInput> {
  if (raw.length === 0) return { ok: false, message: "The photo is empty." };
  if (raw.length > TRYON_MAX_BYTES) return { ok: false, message: "The photo is too large." };
  try {
    const meta = await sharp(raw, { limitInputPixels: 6000 * 6000, failOn: "error" }).metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format) || (meta.pages ?? 1) > 1) return { ok: false, message: "Use a JPEG, PNG or WebP photo." };
    if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < TRYON_MIN_SIDE) return { ok: false, message: "The photo is too small. Please retake it." };
    const image = await sharp(raw, { failOn: "error" }).rotate().resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    return { ok: true, image };
  } catch {
    return { ok: false, message: "That file isn't a valid photo." };
  }
}
