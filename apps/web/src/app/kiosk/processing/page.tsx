import { getPrisma } from "@tanvi/database";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { startOverAction } from "@/features/tryon/kiosk-actions";
import { IdleTimer, Refresher } from "@/features/tryon/kiosk-ui";
import { requireKioskSession } from "@/server/tryon/kiosk";
import { getJobForSession, getTryOnConfig, PROVIDER_NOT_CONFIGURED } from "@/server/tryon/service";

export const dynamic = "force-dynamic";

export default async function ProcessingPage({ searchParams }: { searchParams: Promise<{ job?: string; error?: string }> }) {
  const s = await requireKioskSession();
  const sp = await searchParams;
  const prisma = getPrisma();
  const cfg = await getTryOnConfig(prisma);
  const id = z.string().uuid().safeParse(sp.job);
  const job = id.success ? await getJobForSession(prisma, s.id, id.data) : null;
  if (job?.status === "SUCCEEDED") redirect(`/kiosk/result?job=${job.id}`);
  const inFlight = job && ["CREATED", "VALIDATING", "QUEUED", "PROCESSING"].includes(job.status);
  const failedText = job?.errorCode === PROVIDER_NOT_CONFIGURED ? "Virtual try-on isn't available right now. Please ask a member of our team." : "We couldn't create your look this time.";
  return (
    <main className="grid min-h-screen place-items-center p-8 text-center">
      <IdleTimer seconds={cfg.kioskIdleSeconds} />
      {inFlight ? (
        <div className="space-y-4"><Refresher /><h1 className="text-4xl">Creating your look…</h1><p>This can take a little while.</p></div>
      ) : (
        <div className="space-y-6">
          <h1 className="text-4xl" role="alert">{job ? failedText : (sp.error || "Something went wrong.")}</h1>
          <div className="flex justify-center gap-4"><Link href="/kiosk/collections" className="rounded-sm bg-champagne px-10 py-4 text-espresso">Choose another look</Link>
            <form action={startOverAction}><button className="rounded-sm border border-ivory px-10">Finish</button></form></div>
        </div>
      )}
    </main>
  );
}
