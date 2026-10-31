import { getPrisma } from "@tanvi/database";
import Link from "next/link";
import { redirect } from "next/navigation";
import { declineAndFinishAction, giveConsentAction, startKioskSessionAction } from "@/features/tryon/kiosk-actions";
import { IdleTimer } from "@/features/tryon/kiosk-ui";
import { getDevice, getKioskSession } from "@/server/tryon/kiosk";
import { getTryOnConfig, loadConsentNotice } from "@/server/tryon/service";

export const dynamic = "force-dynamic";

export default async function KioskHome({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const device = await getDevice();
  if (!device) {
    return (
      <main className="grid min-h-screen place-items-center p-8 text-center">
        <div><p className="font-display text-5xl tracking-[0.3em]">TANVI</p><p className="mt-4">This screen isn&apos;t set up yet.</p><Link href="/kiosk/activate" className="mt-4 inline-block underline">Staff: set up this screen</Link></div>
      </main>
    );
  }
  const prisma = getPrisma();
  const session = await getKioskSession();
  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center p-8 text-center">
        <div className="space-y-8">
          <p className="font-display text-7xl tracking-[0.3em]">TANVI</p>
          <p className="text-2xl">See yourself in our kurtis</p>
          <form action={startKioskSessionAction}><button className="rounded-sm bg-champagne px-12 text-espresso">Touch to begin</button></form>
        </div>
      </main>
    );
  }
  if (session.consentId) redirect(session.inputKey ? "/kiosk/collections" : "/kiosk/capture");

  const lang = (await searchParams).lang === "hi" ? "hi" : "en";
  const [notice, noticeEn, cfg] = await Promise.all([loadConsentNotice(prisma, lang), loadConsentNotice(prisma, "en"), getTryOnConfig(prisma)]);
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 p-8">
      <IdleTimer seconds={cfg.kioskIdleSeconds} />
      <nav aria-label="Language" className="flex gap-4 text-lg"><Link href="/kiosk?lang=en" className={lang === "en" ? "underline" : ""}>English</Link><Link href="/kiosk?lang=hi" lang="hi" className={lang === "hi" ? "underline" : ""}>हिन्दी</Link></nav>
      {notice ? (
        <>
          <section aria-labelledby="c-h" lang={lang} className="space-y-4 rounded-sm bg-ivory p-6 text-espresso">
            <h1 id="c-h" className="text-3xl">{notice.text.split("\n")[0]}</h1>
            <p className="whitespace-pre-line text-lg">{notice.text.split("\n").slice(1).join("\n")}</p>
          </section>
          <div className="flex flex-wrap gap-4">
            <form action={giveConsentAction}><input type="hidden" name="locale" value={lang} /><button className="rounded-sm bg-champagne px-10 text-espresso">I agree, take my photo</button></form>
            <form action={declineAndFinishAction}><button className="rounded-sm border border-ivory px-10">No thanks</button></form>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <h1 className="text-3xl">{noticeEn ? "This language isn't available yet" : "Photo try-on isn't ready yet"}</h1>
          <p>{noticeEn ? "Please choose English." : "Our team hasn't finished setting this up. Please ask a member of staff."}</p>
          <form action={declineAndFinishAction}><button className="rounded-sm border border-ivory px-10">Back</button></form>
        </div>
      )}
    </main>
  );
}
