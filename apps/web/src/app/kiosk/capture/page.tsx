import { redirect } from "next/navigation";
import { CaptureScreen, IdleTimer } from "@/features/tryon/kiosk-ui";
import { requireKioskSession } from "@/server/tryon/kiosk";
import { getTryOnConfig } from "@/server/tryon/service";
import { getPrisma } from "@tanvi/database";

export const dynamic = "force-dynamic";

export default async function CapturePage() {
  const s = await requireKioskSession();
  if (!s.consentId) redirect("/kiosk"); // no photo screen without recorded consent
  const cfg = await getTryOnConfig(getPrisma());
  return (
    <>
      <IdleTimer seconds={cfg.kioskIdleSeconds} />
      <CaptureScreen alreadyHasPhoto={Boolean(s.inputKey)} />
    </>
  );
}
