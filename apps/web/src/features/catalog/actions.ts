"use server";

import { getPrisma } from "@tanvi/database";
import { parseRupeesToPaise } from "@tanvi/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermissionForAction } from "@/server/auth/guard";
import {
  addProductImage,
  addVariant,
  archiveProduct,
  createProduct,
  deleteProductImage,
  duplicateProduct,
  publishProduct,
  removeVariant,
  reorderImages,
  setPrimaryImage,
  unpublishProduct,
  updateImageAlt,
  updateProduct,
  updateVariant,
} from "@/server/catalog/products";
import { adjustOnHand, recordStoreSale, setOnHand } from "@/server/catalog/inventory";
import { getStorage } from "@/server/storage/instance";
import { parseProductForm } from "./parse";
import type { ActionState } from "@/components/action-form";

const uuid = z.string().uuid();
const refresh = (productId?: string) => {
  revalidatePath("/admin/products");
  if (productId) revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/inventory");
};

export async function createProductAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("products.write");
  const parsed = parseProductForm(form);
  if (!parsed.ok) return { error: parsed.message };
  const res = await createProduct(getPrisma(), parsed.fields, actor.user.id);
  if (!res.ok) return { error: res.message };
  redirect(`/admin/products/${res.id}`);
}

export async function updateProductAction(productId: string, _p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("products.write");
  const parsed = parseProductForm(form);
  if (!parsed.ok) return { error: parsed.message };
  const res = await updateProduct(getPrisma(), uuid.parse(productId), parsed.fields, actor.user.id, parsed.slug ?? undefined);
  if (!res.ok) return { error: res.message };
  refresh(productId);
  return { ok: "Saved." };
}

type Transition = "publish" | "unpublish" | "archive" | "duplicate";

export async function productTransitionAction(productId: string, kind: Transition, _p: ActionState): Promise<ActionState> {
  const actor = await requirePermissionForAction(kind === "publish" || kind === "unpublish" ? "products.publish" : "products.write");
  const id = uuid.parse(productId);
  const prisma = getPrisma();
  if (kind === "duplicate") {
    const res = await duplicateProduct(prisma, id, actor.user.id);
    if (!res.ok) return { error: res.message };
    redirect(`/admin/products/${res.id}`);
  }
  const res = await (kind === "publish" ? publishProduct : kind === "unpublish" ? unpublishProduct : archiveProduct)(prisma, id, actor.user.id);
  if (!res.ok) return { error: res.message };
  refresh(id);
  return { ok: kind === "publish" ? "Published." : kind === "unpublish" ? "Moved back to draft." : "Archived." };
}

export async function addVariantAction(productId: string, _p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("products.write");
  const priceText = String(form.get("price") ?? "").trim();
  const price = priceText ? parseRupeesToPaise(priceText) : null;
  if (priceText && price === null) return { error: "The variant price is not a valid amount." };
  const stockText = String(form.get("stock") ?? "0").trim();
  const stock = /^\d{1,6}$/.test(stockText) ? Number(stockText) : null;
  if (stock === null) return { error: "Opening stock must be a whole number." };
  const res = await addVariant(
    getPrisma(),
    uuid.parse(productId),
    { size: String(form.get("size") ?? ""), colour: String(form.get("colour") ?? ""), sku: String(form.get("sku") ?? ""), pricePaise: price, initialStock: stock },
    actor.user.id,
  );
  if (!res.ok) return { error: res.message };
  refresh(productId);
  return { ok: "Variant added." };
}

export async function updateVariantAction(form: FormData): Promise<void> {
  const actor = await requirePermissionForAction("products.write");
  const priceText = String(form.get("price") ?? "").trim();
  const price = priceText ? parseRupeesToPaise(priceText) : null;
  if (priceText && price === null) return;
  await updateVariant(getPrisma(), uuid.parse(form.get("variantId")), { pricePaise: price, isActive: form.get("isActive") === "on" }, actor.user.id);
  refresh(String(form.get("productId")));
}

export async function removeVariantAction(form: FormData): Promise<void> {
  const actor = await requirePermissionForAction("products.write");
  await removeVariant(getPrisma(), uuid.parse(form.get("variantId")), actor.user.id);
  refresh(String(form.get("productId")));
}

export async function uploadImageAction(productId: string, _p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("products.write");
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose at least one image." };
  const alt = String(form.get("alt") ?? "");
  let added = 0;
  for (const file of files) {
    const res = await addProductImage(getPrisma(), getStorage(), {
      productId: uuid.parse(productId),
      file: Buffer.from(await file.arrayBuffer()),
      altText: alt || file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
      actorId: actor.user.id,
    });
    if (!res.ok) return { error: `${file.name}: ${res.message}${added ? ` (${added} uploaded before this)` : ""}` };
    added++;
  }
  refresh(productId);
  return { ok: `${added} image${added === 1 ? "" : "s"} uploaded. The product was not published.` };
}

export async function imageAltAction(form: FormData): Promise<void> {
  const actor = await requirePermissionForAction("products.write");
  await updateImageAlt(getPrisma(), uuid.parse(form.get("imageId")), String(form.get("alt") ?? ""), actor.user.id);
  refresh(String(form.get("productId")));
}

export async function imagePrimaryAction(form: FormData): Promise<void> {
  const actor = await requirePermissionForAction("products.write");
  await setPrimaryImage(getPrisma(), uuid.parse(form.get("imageId")), actor.user.id);
  refresh(String(form.get("productId")));
}

export async function imageMoveAction(form: FormData): Promise<void> {
  const actor = await requirePermissionForAction("products.write");
  const productId = uuid.parse(form.get("productId"));
  const imageId = uuid.parse(form.get("imageId"));
  const dir = form.get("dir") === "up" ? -1 : 1;
  const prisma = getPrisma();
  const ids = (await prisma.productImage.findMany({ where: { productId }, orderBy: { position: "asc" }, select: { id: true } })).map((i) => i.id);
  const at = ids.indexOf(imageId);
  const to = at + dir;
  if (at === -1 || to < 0 || to >= ids.length) return;
  [ids[at], ids[to]] = [ids[to] as string, ids[at] as string];
  await reorderImages(prisma, productId, ids, actor.user.id);
  refresh(productId);
}

export async function imageDeleteAction(form: FormData): Promise<void> {
  const actor = await requirePermissionForAction("products.write");
  await deleteProductImage(getPrisma(), getStorage(), uuid.parse(form.get("imageId")), actor.user.id);
  refresh(String(form.get("productId")));
}

// ---------- inventory ----------

const qty = z.coerce.number().int().min(-100000).max(100000);

export async function adjustStockAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("inventory.adjust");
  const mode = String(form.get("mode"));
  const variantId = uuid.safeParse(form.get("variantId"));
  const locationId = uuid.safeParse(form.get("locationId"));
  const n = qty.safeParse(form.get("quantity"));
  const reason = String(form.get("reason") ?? "").trim();
  if (!variantId.success || !locationId.success) return { error: "Choose a variant." };
  if (!n.success || (mode !== "set" && n.data === 0)) return { error: "Enter a whole number." };
  const prisma = getPrisma();
  const base = { variantId: variantId.data, locationId: locationId.data, actorId: actor.user.id };
  let res;
  if (mode === "store_sale") {
    if (n.data <= 0) return { error: "Enter how many units were sold." };
    res = await recordStoreSale(prisma, { ...base, quantity: n.data, reference: reason || "Store sale" });
  } else if (mode === "set") {
    if (n.data < 0) return { error: "The counted quantity cannot be negative." };
    res = await setOnHand(prisma, { ...base, target: n.data, reason });
  } else {
    res = await adjustOnHand(prisma, { ...base, delta: n.data, reason });
  }
  if (!res.ok) {
    return {
      error:
        res.reason === "insufficient_stock" ? "Not enough available stock." : res.reason === "below_reserved" ? "That would drop stock below what is already reserved for orders." : "Enter a quantity and a reason (at least 3 characters).",
    };
  }
  revalidatePath("/admin/inventory");
  return { ok: "Stock updated." };
}

export async function setThresholdAction(form: FormData): Promise<void> {
  await requirePermissionForAction("inventory.adjust");
  const t = z.coerce.number().int().min(0).max(1000).safeParse(form.get("threshold"));
  if (!t.success) return;
  await getPrisma().inventoryBalance.updateMany({
    where: { variantId: uuid.parse(form.get("variantId")), locationId: uuid.parse(form.get("locationId")) },
    data: { lowStockThreshold: t.data },
  });
  revalidatePath("/admin/inventory");
}
