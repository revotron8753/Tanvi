"use server";

import { getPrisma } from "@tanvi/database";
import { parseRupeesToPaise } from "@tanvi/domain";
import { checkoutSchema, settingsSchema } from "@tanvi/validation";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { requirePermissionForAction } from "@/server/auth/guard";
import { addToCart, createCart } from "@/server/cart/service";
import { getPaymentProvider } from "@/server/payments/instance";
import { recordAudit } from "@/server/catalog/audit";
import { assignInvoiceNumber, cancelOrder, confirmOrder, markDelivered, markRefunded, markShipped, placeOrder } from "@/server/orders/service";
import { getSettings, saveSettings } from "@/server/orders/settings";

const uuid = z.string().uuid();
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

type Step = "confirm" | "ship" | "deliver" | "cancel" | "refund" | "invoice";

export async function orderStepAction(orderId: string, step: Step, _p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("orders.write");
  const id = uuid.parse(orderId);
  const prisma = getPrisma();
  const staff = { actorId: actor.user.id };
  let res: { ok: true } | { ok: false; message: string };
  if (step === "confirm") res = await confirmOrder(prisma, id, staff);
  else if (step === "ship") res = await markShipped(prisma, id, { carrier: str(form, "carrier") || null, trackingNumber: str(form, "tracking") || null }, staff);
  else if (step === "deliver") res = await markDelivered(prisma, id, staff);
  else if (step === "cancel") {
    const reason = str(form, "reason");
    res = reason.length < 3 ? { ok: false, message: "Enter a reason for cancelling." } : await cancelOrder(prisma, { orderId: id, actorId: actor.user.id, reason });
  } else if (step === "refund") res = await markRefunded(prisma, id, str(form, "note"), staff);
  else {
    const r = await assignInvoiceNumber(prisma, id, staff);
    res = r.ok ? { ok: true } : r;
  }
  if (!res.ok) return { error: res.message };
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/orders");
  return { ok: "Done." };
}

export async function saveSettingsAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("settings.write");
  const money = (k: string): number | null | "bad" => {
    const v = str(form, k);
    if (!v) return null;
    const p = parseRupeesToPaise(v);
    return p === null ? "bad" : p;
  };
  const flat = money("shippingFlat");
  const free = money("freeShipping");
  const codMax = money("codMax");
  const codFee = money("codFee");
  if (flat === "bad" || free === "bad" || codMax === "bad" || codFee === "bad") return { error: "Enter money amounts in rupees, for example 99 or 1,999.50." };
  const parsed = settingsSchema.safeParse({
    taxMode: str(form, "taxMode") || "UNSET",
    legalName: str(form, "legalName"),
    gstin: str(form, "gstin"),
    businessAddress: str(form, "businessAddress"),
    businessStateCode: str(form, "businessStateCode"),
    invoicePrefix: str(form, "invoicePrefix"),
    shippingFlatPaise: flat ?? 0,
    freeShippingThresholdPaise: free,
    codEnabled: form.get("codEnabled") === "on",
    codMaxOrderPaise: codMax,
    codFeePaise: codFee ?? 0,
    reservationMinutes: Number(str(form, "reservationMinutes") || "15"),
    showExactStock: form.get("showExactStock") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  await saveSettings(getPrisma(), parsed.data, actor.user.id);
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}

export async function saveCouponAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("campaigns.write");
  const code = str(form, "code").toUpperCase();
  const type = str(form, "type") === "FIXED" ? "FIXED" : "PERCENT";
  const raw = str(form, "value");
  const value = type === "PERCENT" ? (/^\d{1,2}(\.\d{1,2})?$/.test(raw) ? Math.round(Number(raw) * 100) : null) : parseRupeesToPaise(raw);
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return { error: "Code: 3–40 letters, numbers, dashes." };
  if (value === null || value <= 0 || (type === "PERCENT" && value > 10000)) return { error: type === "PERCENT" ? "Percentage must be between 0.01 and 100." : "Enter the discount amount in rupees." };
  const min = str(form, "min") ? parseRupeesToPaise(str(form, "min")) : 0;
  const max = str(form, "max") ? parseRupeesToPaise(str(form, "max")) : null;
  if (min === null || (str(form, "max") && max === null)) return { error: "Enter amounts in rupees." };
  const maxUses = str(form, "maxUses") ? Number.parseInt(str(form, "maxUses"), 10) : null;
  const endsAt = str(form, "endsAt") ? new Date(`${str(form, "endsAt")}T23:59:59+05:30`) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) return { error: "Enter a valid end date." };
  try {
    const c = await getPrisma().coupon.create({ data: { code, type, value, minSubtotalPaise: min, maxDiscountPaise: max, maxUses, endsAt } });
    await recordAudit(getPrisma(), { actorId: actor.user.id, action: "coupon.created", entityType: "Coupon", entityId: c.id });
  } catch {
    return { error: "A coupon with that code already exists." };
  }
  revalidatePath("/admin/campaigns");
  return { ok: "Coupon created." };
}

export async function toggleCouponAction(form: FormData): Promise<void> {
  const actor = await requirePermissionForAction("campaigns.write");
  const id = uuid.parse(form.get("id"));
  const c = await getPrisma().coupon.findUnique({ where: { id } });
  if (!c) return;
  await getPrisma().coupon.update({ where: { id }, data: { isActive: !c.isActive } });
  await recordAudit(getPrisma(), { actorId: actor.user.id, action: c.isActive ? "coupon.disabled" : "coupon.enabled", entityType: "Coupon", entityId: id });
  revalidatePath("/admin/campaigns");
}

// ---------- Staff-created (WhatsApp-assisted) orders ----------


/**
 * Staff create an order after agreeing it with the customer on WhatsApp. This is the ONLY way a WhatsApp order
 * is created: clicking a WhatsApp link never creates one. Pricing and stock reservation are the same server code as web checkout.
 */
export async function createStaffOrderAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requirePermissionForAction("orders.write");
  const prisma = getPrisma();
  const lines: { variantId: string; quantity: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const v = uuid.safeParse(form.get(`variant${i}`));
    const q = Number(form.get(`qty${i}`) ?? 0);
    if (v.success && Number.isInteger(q) && q > 0) lines.push({ variantId: v.data, quantity: q });
  }
  if (lines.length === 0) return { error: "Add at least one item." };
  const parsed = checkoutSchema.safeParse({ ...Object.fromEntries(form), idempotencyKey: String(form.get("idempotencyKey") ?? randomUUID()) });
  if (!parsed.success) return { error: `${String(parsed.error.issues[0]?.path[0] ?? "Details")}: ${parsed.error.issues[0]?.message ?? "invalid"}` };

  const cart = await createCart(prisma);
  for (const l of lines) {
    const r = await addToCart(prisma, cart.id, l.variantId, l.quantity);
    if (!r.ok) return { error: r.message };
  }
  const res = await placeOrder(prisma, { cartId: cart.id, input: parsed.data, settings: await getSettings(prisma), provider: getPaymentProvider(), source: "WHATSAPP", staffId: actor.user.id });
  if (!res.ok) return { error: res.message };
  await recordAudit(prisma, { actorId: actor.user.id, action: "order.created_by_staff", entityType: "Order", entityId: res.orderId, metadata: { source: "WHATSAPP" } });
  revalidatePath("/admin/orders");
  const link = res.needsPayment ? ` Payment link to send the customer: /checkout/pay/${res.reference}?t=${res.accessToken}` : ` Order link for the customer: /order-confirmation/${res.reference}?t=${res.accessToken}`;
  return { ok: `Order ${res.reference} created and stock reserved.${link}` };
}
