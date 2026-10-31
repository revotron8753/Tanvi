import { getPrisma } from "@tanvi/database";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { continueOnPhoneAction, startOverAction } from "@/features/tryon/kiosk-actions";
import { IdleTimer } from "@/features/tryon/kiosk-ui";
import { requireKioskSession } from "@/server/tryon/kiosk";
import { getJobForSession, getTryOnConfig } from "@/server/tryon/service";

export const dynamic = "force-dynamic";

export default async function ResultPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const s = await requireKioskSession();
  const id = z.string().uuid().safeParse((await searchParams).job);
  const prisma = getPrisma();
  const job = id.success ? await getJobForSession(prisma, s.id, id.data) : null;
  if (!job || job.status !== "SUCCEEDED" || !job.resultKey) notFound();
  const [product, cfg] = await Promise.all([prisma.product.findUnique({ where: { id: job.productId }, select: { name: true } }), getTryOnConfig(prisma)]);
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8 text-center">
      <IdleTimer seconds={cfg.kioskIdleSeconds} />
      <h1 className="text-4xl">{product?.name}</h1>
      <div className="grid grid-cols-2 gap-4">
        <figure>{/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kiosk/asset/input" alt="Before: your photo" className="max-h-[60vh] w-full object-contain" /><figcaption>You</figcaption></figure>
        <figure>{/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/kiosk/asset/result/${job.id}`} alt={`After: you wearing ${product?.name ?? "the garment"}`} className="max-h-[60vh] w-full object-contain" /><figcaption>With {product?.name}</figcaption></figure>
      </div>
      <p className="text-sm">Generated image. Colours, fit and drape may differ from the real garment.</p>
      <div className="flex flex-wrap justify-center gap-4">
        <Link href="/kiosk/collections" className="rounded-sm border border-ivory px-8 py-4">Try another</Link>
        <form action={continueOnPhoneAction}><input type="hidden" name="productId" value={job.productId} /><button className="rounded-sm bg-champagne px-8 text-espresso">Continue on my phone</button></form>
        <form action={startOverAction}><button className="rounded-sm border border-ivory px-8">Finish and delete my photo</button></form>
      </div>
    </main>
  );
}
