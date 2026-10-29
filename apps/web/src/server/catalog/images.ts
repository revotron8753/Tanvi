import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MIN_DIMENSION = 600;
export const MAX_DIMENSION = 8000;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export const RENDITIONS = [
  { name: "thumb", width: 320 },
  { name: "md", width: 800 },
  { name: "lg", width: 1600 },
] as const;
export type RenditionName = (typeof RENDITIONS)[number]["name"];

export type ProcessedImage =
  | { ok: true; width: number; height: number; renditions: Record<RenditionName, Buffer> }
  | { ok: false; message: string };

/**
 * Validates by decoding the actual bytes (not the filename or declared MIME type), then re-encodes every
 * rendition to WebP. Re-encoding drops EXIF/GPS metadata and any trailing/polyglot payload.
 */
export async function processProductImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length === 0) return { ok: false, message: "The file is empty." };
  if (input.length > MAX_UPLOAD_BYTES) return { ok: false, message: "The image is larger than 10 MB." };
  try {
    const img = sharp(input, { limitInputPixels: MAX_DIMENSION * MAX_DIMENSION, failOn: "error" });
    const meta = await img.metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) return { ok: false, message: "Use a JPEG, PNG or WebP image." };
    if ((meta.pages ?? 1) > 1) return { ok: false, message: "Animated images are not supported." };
    const { width, height } = meta;
    if (!width || !height) return { ok: false, message: "The image could not be read." };
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) return { ok: false, message: `The image is larger than ${MAX_DIMENSION}px on a side.` };
    if (Math.min(width, height) < MIN_DIMENSION) return { ok: false, message: `The image is smaller than ${MIN_DIMENSION}px on its short side.` };

    const out = {} as Record<RenditionName, Buffer>;
    for (const r of RENDITIONS) {
      out[r.name] = await sharp(input, { failOn: "error" })
        .rotate() // honour EXIF orientation before metadata is stripped
        .resize({ width: r.width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    }
    return { ok: true, width, height, renditions: out };
  } catch {
    return { ok: false, message: "The file is not a valid image." };
  }
}
