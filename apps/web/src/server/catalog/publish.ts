export interface PublishCheck {
  name: string;
  slug: string;
  categoryPublished: boolean;
  pricePaise: number;
  imageCount: number;
  imagesMissingAlt: number;
  activeVariantCount: number;
  hsnCode: string | null;
}

/** Publication requires essential fields and at least one image (SPEC §8). Returns human-readable problems. */
export function publishProblems(p: PublishCheck): string[] {
  const out: string[] = [];
  if (p.name.trim().length < 2) out.push("Add a product name.");
  if (!p.slug) out.push("Add a URL slug.");
  if (p.pricePaise <= 0) out.push("Set a price above ₹0.");
  if (!p.categoryPublished) out.push("The category must be published.");
  if (p.imageCount < 1) out.push("Upload at least one image.");
  if (p.imagesMissingAlt > 0) out.push("Add alt text to every image.");
  if (p.activeVariantCount < 1) out.push("Add at least one size/colour variant.");
  return out;
}
