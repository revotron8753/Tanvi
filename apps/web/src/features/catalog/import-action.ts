"use server";

import { getPrisma } from "@tanvi/database";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { requirePermissionForAction } from "@/server/auth/guard";
import { importProductsCsv } from "@/server/catalog/import";

export async function importProductsAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("products.write");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > 2 * 1024 * 1024) return { error: "The file is larger than 2 MB." };
  const dryRun = form.get("mode") !== "import";
  const report = await importProductsCsv(getPrisma(), await file.text(), actor.user.id, dryRun);
  if (report.errors.length > 0) {
    return { error: `Nothing was imported. ${report.errors.slice(0, 8).map((e) => (e.line ? `Line ${e.line}: ${e.message}` : e.message)).join(" ")}${report.errors.length > 8 ? ` …and ${report.errors.length - 8} more.` : ""}` };
  }
  if (dryRun) return { ok: `Check passed: ${report.created} products and ${report.variantsAdded} variants would be created as drafts. Nothing was saved yet.` };
  revalidatePath("/admin/products");
  return { ok: `Imported ${report.created} draft products with ${report.variantsAdded} variants.` };
}
