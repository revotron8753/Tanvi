import { getPrisma } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { tryGarmentAction } from "@/features/tryon/kiosk-actions";
import { IdleTimer } from "@/features/tryon/kiosk-ui";
import { requireKioskSession } from "@/server/tryon/kiosk";
import { getTryOnConfig } from "@/server/tryon/service";
import { LIVE } from "@/server/storefront/queries";

export const dynamic = "force-dynamic";

export default async function KioskProducts({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const s = await requireKioskSession();
  if (!s.consentId || !s.inputKey) redirect("/kiosk");
  const prisma = getPrisma();
  const slug = (await searchParams).category;
  const [products, cfg] = await Promise.all([
    prisma.product.findMany({
      where: { AND: [LIVE, { tryOnEligible: true, tryOnGarmentKey: { not: null } }, slug ? { category: { slug } } : {}] },
      orderBy: { publishedAt: "desc" },
      take: 24,
      include: { images: { orderBy: { position: "asc" }, take: 1 } },
    }),
    getTryOnConfig(prisma),
  ]);
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <IdleTimer seconds={cfg.kioskIdleSeconds} />
      <div className="flex items-center justify-between"><h1 className="text-5xl">Pick a look</h1><Link href="/kiosk/collections" className="underline">All collections</Link></div>
      {products.length === 0 ? <p className="text-xl">Nothing here is ready for try-on yet.</p> : (
        <ul className="grid grid-cols-2 gap-6 md:grid-cols-3">
          {products.map((p) => (
            <li key={p.id}>
              <form action={tryGarmentAction} className="space-y-2">
                <input type="hidden" name="productId" value={p.id} />
                <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                <button className="block w-full overflow-hidden rounded-sm bg-ivory text-left text-espresso">
                  {p.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/media/${p.images[0].storageKey}/md.webp`} alt={p.images[0].altText} width={800} height={1067} className="aspect-[3/4] w-full object-cover" />
                  ) : null}
                  <span className="block p-3 text-lg">{p.name}<br /><span className="text-base">{formatPaise(paise(p.pricePaise))}</span></span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
