import type { Prisma, PrismaClient } from "@tanvi/database";

/** Every function accepts a transaction client so callers (orders, admin) can compose them atomically. */
export type Db = PrismaClient | Prisma.TransactionClient;

export type StockResult = { ok: true } | { ok: false; reason: "insufficient_stock" | "invalid_quantity" | "below_reserved" };

const positiveInt = (n: number): boolean => Number.isSafeInteger(n) && n > 0;

async function ensureBalance(db: Db, variantId: string, locationId: string): Promise<void> {
  await db.$executeRaw`INSERT INTO "InventoryBalance" ("id","variantId","locationId","updatedAt")
    VALUES (gen_random_uuid(), ${variantId}::uuid, ${locationId}::uuid, now())
    ON CONFLICT ("variantId","locationId") DO NOTHING`;
}

async function ledger(
  db: Db,
  e: { variantId: string; locationId: string; type: Prisma.InventoryMovementCreateInput["type"]; deltaOnHand?: number; deltaReserved?: number; reason?: string | null; reference?: string | null; actorId?: string | null },
): Promise<void> {
  await db.inventoryMovement.create({
    data: {
      variantId: e.variantId,
      locationId: e.locationId,
      type: e.type,
      deltaOnHand: e.deltaOnHand ?? 0,
      deltaReserved: e.deltaReserved ?? 0,
      reason: e.reason ?? null,
      reference: e.reference ?? null,
      actorId: e.actorId ?? null,
    },
  });
}

/** Manual change of on-hand by a signed delta (receipt, correction, damage…). A reason is mandatory. */
export async function adjustOnHand(
  db: Db,
  input: { variantId: string; locationId: string; delta: number; reason: string; actorId: string; type?: "ADJUSTMENT" | "RECEIPT" },
): Promise<StockResult> {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0 || input.reason.trim().length < 3) return { ok: false, reason: "invalid_quantity" };
  await ensureBalance(db, input.variantId, input.locationId);
  const n = await db.$executeRaw`UPDATE "InventoryBalance" SET "onHand" = "onHand" + ${input.delta}, "updatedAt" = now()
    WHERE "variantId" = ${input.variantId}::uuid AND "locationId" = ${input.locationId}::uuid AND "onHand" + ${input.delta} >= "reserved"`;
  if (n === 0) return { ok: false, reason: "below_reserved" };
  await ledger(db, { ...input, type: input.type ?? (input.delta > 0 ? "RECEIPT" : "ADJUSTMENT"), deltaOnHand: input.delta });
  return { ok: true };
}

/** Sets on-hand to an absolute counted value (stocktake). Records the computed delta. */
export async function setOnHand(
  db: Db,
  input: { variantId: string; locationId: string; target: number; reason: string; actorId: string },
): Promise<StockResult> {
  if (!Number.isSafeInteger(input.target) || input.target < 0) return { ok: false, reason: "invalid_quantity" };
  await ensureBalance(db, input.variantId, input.locationId);
  const rows = await db.$queryRaw<{ onHand: number }[]>`SELECT "onHand" FROM "InventoryBalance"
    WHERE "variantId" = ${input.variantId}::uuid AND "locationId" = ${input.locationId}::uuid FOR UPDATE`;
  const delta = input.target - (rows[0]?.onHand ?? 0);
  if (delta === 0) return { ok: true };
  return adjustOnHand(db, { ...input, delta, type: "ADJUSTMENT" });
}

/** Atomic conditional reserve: succeeds only if available >= qty. Safe under concurrency. */
export async function reserveStock(
  db: Db,
  input: { variantId: string; locationId: string; quantity: number; reference: string; actorId?: string | null },
): Promise<StockResult> {
  if (!positiveInt(input.quantity)) return { ok: false, reason: "invalid_quantity" };
  const n = await db.$executeRaw`UPDATE "InventoryBalance" SET "reserved" = "reserved" + ${input.quantity}, "updatedAt" = now()
    WHERE "variantId" = ${input.variantId}::uuid AND "locationId" = ${input.locationId}::uuid AND "onHand" - "reserved" >= ${input.quantity}`;
  if (n === 0) return { ok: false, reason: "insufficient_stock" };
  await ledger(db, { ...input, type: "RESERVE", deltaReserved: input.quantity });
  return { ok: true };
}

export async function releaseReservation(
  db: Db,
  input: { variantId: string; locationId: string; quantity: number; reference: string; reason?: string },
): Promise<StockResult> {
  if (!positiveInt(input.quantity)) return { ok: false, reason: "invalid_quantity" };
  const n = await db.$executeRaw`UPDATE "InventoryBalance" SET "reserved" = "reserved" - ${input.quantity}, "updatedAt" = now()
    WHERE "variantId" = ${input.variantId}::uuid AND "locationId" = ${input.locationId}::uuid AND "reserved" >= ${input.quantity}`;
  if (n === 0) return { ok: false, reason: "invalid_quantity" };
  await ledger(db, { ...input, type: "RELEASE", deltaReserved: -input.quantity, reason: input.reason ?? null });
  return { ok: true };
}

/** Converts a reservation into a sale: on-hand and reserved both drop. */
export async function commitReservedSale(
  db: Db,
  input: { variantId: string; locationId: string; quantity: number; reference: string },
): Promise<StockResult> {
  if (!positiveInt(input.quantity)) return { ok: false, reason: "invalid_quantity" };
  const n = await db.$executeRaw`UPDATE "InventoryBalance" SET "onHand" = "onHand" - ${input.quantity}, "reserved" = "reserved" - ${input.quantity}, "updatedAt" = now()
    WHERE "variantId" = ${input.variantId}::uuid AND "locationId" = ${input.locationId}::uuid AND "reserved" >= ${input.quantity}`;
  if (n === 0) return { ok: false, reason: "invalid_quantity" };
  await ledger(db, { ...input, type: "SALE", deltaOnHand: -input.quantity, deltaReserved: -input.quantity });
  return { ok: true };
}

/** Manual workflow for a sale made in the physical store (no POS integration). Needs available stock. */
export async function recordStoreSale(
  db: Db,
  input: { variantId: string; locationId: string; quantity: number; reference: string; actorId: string },
): Promise<StockResult> {
  if (!positiveInt(input.quantity)) return { ok: false, reason: "invalid_quantity" };
  const n = await db.$executeRaw`UPDATE "InventoryBalance" SET "onHand" = "onHand" - ${input.quantity}, "updatedAt" = now()
    WHERE "variantId" = ${input.variantId}::uuid AND "locationId" = ${input.locationId}::uuid AND "onHand" - "reserved" >= ${input.quantity}`;
  if (n === 0) return { ok: false, reason: "insufficient_stock" };
  await ledger(db, { ...input, type: "STORE_SALE", deltaOnHand: -input.quantity, reason: "In-store sale" });
  return { ok: true };
}

export type Availability = "in_stock" | "low_stock" | "out_of_stock";

/** Available = onHand − reserved, summed over active locations. Calculated in exactly one place. */
export function classifyAvailability(rows: ReadonlyArray<{ onHand: number; reserved: number; lowStockThreshold: number }>): { available: number; status: Availability } {
  const available = rows.reduce((s, r) => s + (r.onHand - r.reserved), 0);
  if (available <= 0) return { available: 0, status: "out_of_stock" };
  const threshold = rows.reduce((s, r) => s + r.lowStockThreshold, 0);
  return { available, status: available <= threshold ? "low_stock" : "in_stock" };
}
