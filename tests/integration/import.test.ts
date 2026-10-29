import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrisma } from "@tanvi/database";
import { seedCore } from "../../packages/database/src/seed-core";
import { importProductsCsv } from "../../apps/web/src/server/catalog/import";

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("CSV import (real PostgreSQL)", () => {
  const prisma = createPrisma(url ?? "");
  const run = randomBytes(3).toString("hex").toUpperCase();
  let actorId = "";
  const header = "parentCode,name,category,pricePaise,comparePricePaise,hsnCode,fabric,sku,size,colour,onHand";

  beforeAll(async () => {
    await seedCore(prisma);
    actorId = (await prisma.user.create({ data: { email: `imp-${run}@example.test`, name: "imp", passwordHash: "x" } })).id;
  });
  afterAll(async () => prisma.$disconnect());

  it("dry run validates without saving", async () => {
    const csv = `${header}\nK${run}A,Rose Kurti,Premium Wear,249900,,6104,Cotton,,M,Rose,3\nK${run}A,Rose Kurti,Premium Wear,249900,,6104,Cotton,,L,Rose,2\n`;
    const r = await importProductsCsv(prisma, csv, actorId, true);
    expect(r).toMatchObject({ created: 1, variantsAdded: 2, errors: [] });
    expect(await prisma.product.count({ where: { parentCode: `K${run}A` } })).toBe(0);
  });

  it("imports grouped drafts with stock, then refuses to overwrite", async () => {
    const csv = `${header}\nK${run}B,Teal Set,Co-ord Sets,399900,,,,,S,Teal,5\nK${run}B,Teal Set,Co-ord Sets,399900,,,,,M,Teal,0\n`;
    const r = await importProductsCsv(prisma, csv, actorId, false);
    expect(r).toMatchObject({ created: 1, variantsAdded: 2 });
    const p = await prisma.product.findFirstOrThrow({ where: { parentCode: `K${run}B` }, include: { variants: { include: { balances: true } } } });
    expect(p.status).toBe("DRAFT");
    expect(p.variants.reduce((s, v) => s + (v.balances[0]?.onHand ?? 0), 0)).toBe(5);
    const again = await importProductsCsv(prisma, csv, actorId, false);
    expect(again.created).toBe(0);
    expect(again.errors[0]?.message).toContain("already exists");
  });

  it("is all-or-nothing: one bad row blocks every row", async () => {
    const csv = `${header}\nK${run}C,Good,Regular Wear,100000,,,,,M,Red,1\nK${run}D,Bad,Nonexistent Category,100000,,,,,M,Red,1\nK${run}E,BadPrice,Regular Wear,19.99,,,,,M,Red,1\n`;
    const r = await importProductsCsv(prisma, csv, actorId, false);
    expect(r.created).toBe(0);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
    expect(await prisma.product.count({ where: { parentCode: `K${run}C` } })).toBe(0);
  });

  it("rejects files with missing columns", async () => {
    const r = await importProductsCsv(prisma, "name,price\nA,1\n", actorId, true);
    expect(r.errors[0]?.message).toContain("Missing columns");
  });
});
