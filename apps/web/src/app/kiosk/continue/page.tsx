import { getPrisma } from "@tanvi/database";
import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { startOverAction } from "@/features/tryon/kiosk-actions";
import { IdleTimer } from "@/features/tryon/kiosk-ui";
import { env } from "@/server/env";
import { requireKioskSession } from "@/server/tryon/kiosk";
import { getTryOnConfig } from "@/server/tryon/service";

export const dynamic = "force-dynamic";

export default async function ContinuePage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await requireKioskSession();
  const c = (await searchParams).c;
  if (!c || !/^[A-Za-z0-9_-]{20,64}$/.test(c)) notFound();
  const cfg = await getTryOnConfig(getPrisma());
  // The QR holds only an opaque, short-lived link to one product page: no photo, no personal data, no internal ids.
  const svg = await QRCode.toString(`${env().SITE_URL}/k/${c}`, { type: "svg", margin: 1, width: 360, color: { dark: "#38271F", light: "#FAF7F2" } });
  return (
    <main className="grid min-h-screen place-items-center p-8 text-center">
      <IdleTimer seconds={cfg.kioskIdleSeconds} />
      <div className="space-y-6">
        <h1 className="text-4xl">Scan to continue on your phone</h1>
        <div role="img" aria-label="QR code to open this product on your phone" className="mx-auto w-[360px] rounded-sm bg-ivory p-2" dangerouslySetInnerHTML={{ __html: svg }} />
        <p>The link works for {cfg.continuationMinutes} minutes. Your photo is not shared.</p>
        <form action={startOverAction}><button className="rounded-sm bg-champagne px-10 text-espresso">Finish and delete my photo</button></form>
      </div>
    </main>
  );
}
