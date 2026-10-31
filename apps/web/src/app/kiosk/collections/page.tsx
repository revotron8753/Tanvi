import { getPrisma } from "@tanvi/database";
import Link from "next/link";
import { redirect } from "next/navigation";
import { startOverAction } from "@/features/tryon/kiosk-actions";
import { IdleTimer } from "@/features/tryon/kiosk-ui";
import { requireKioskSession } from "@/server/tryon/kiosk";
import { getTryOnConfig } from "@/server/tryon/service";
import { LIVE } from "@/server/storefront/queries";

export const dynamic = "force-dynamic";

export default async function KioskCollections() {
  const s = await requireKioskSession();
  if (!s.consentId || !s.inputKey) redirect("/kiosk");
  const prisma = getPrisma();
  const [cats, cfg] = await Promise.all([
    prisma.category.findMany({
      where: { isPublished: true, products: { some: { AND: [LIVE, { tryOnEligible: true, tryOnGarmentKey: { not: null } }] } } },
      orderBy: { displayOrder: "asc" },
    }),
    getTryOnConfig(prisma),
  ]);
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <IdleTimer seconds={cfg.kioskIdleSeconds} />
      <h1 className="text-5xl">Choose a collection</h1>
      {cats.length === 0 ? <p className="text-xl">No garments are ready for try-on yet. Please ask our team.</p> : (
        <ul className="grid grid-cols-2 gap-6">
          {cats.map((c) => <li key={c.id}><Link href={`/kiosk/products?category=${c.slug}`} className="grid min-h-40 place-items-center rounded-sm bg-ivory p-6 text-center font-display text-3xl text-espresso">{c.name}</Link></li>)}
        </ul>
      )}
      <form action={startOverAction}><button className="rounded-sm border border-ivory px-10">Finish and delete my photo</button></form>
    </main>
  );
}
