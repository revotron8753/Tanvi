import { getPrisma } from "@tanvi/database";
import { formatPaise, paise } from "@tanvi/domain";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { createDeviceAction, revokeDeviceAction, saveTryOnConfigAction } from "@/features/tryon/admin-actions";
import { requireAdmin } from "@/server/auth/guard";
import { getAiTryOnProvider } from "@/server/tryon/instance";
import { getTryOnConfig, loadConsentNotice } from "@/server/tryon/service";

export const dynamic = "force-dynamic";

export default async function TryOnAdminPage() {
  const auth = await requireAdmin("tryon.read");
  const prisma = getPrisma();
  const canWrite = auth.permissions.has("settings.write");
  const [cfg, devices, jobs, sessionCount, en, hi] = await Promise.all([
    getTryOnConfig(prisma),
    prisma.kioskDevice.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.tryOnJob.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { product: { select: { name: true } } } }),
    prisma.tryOnSession.count(),
    loadConsentNotice(prisma, "en"),
    loadConsentNotice(prisma, "hi"),
  ]);
  const provider = getAiTryOnProvider();
  const cost = jobs.reduce((s, j) => s + (j.costPaise ?? 0), 0);
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Virtual try-on</h1>
      <div className="mt-3 space-y-1 text-sm" role="status">
        <p className={provider ? "" : "text-danger"}>AI service: <strong>{provider ? `connected (${provider.name})` : "not connected. Every try-on attempt fails with a clear message; no images are generated"}</strong></p>
        <p>Photo consent notice: English <strong>{en ? `set (v${en.version})` : "missing"}</strong> · Hindi <strong>{hi ? `set (v${hi.version})` : "missing"}</strong>. Kiosk photo capture is refused until the English notice exists. Edit in Admin → Content; wording needs review by the owner or legal counsel.</p>
        <p>{sessionCount} sessions recorded · cost on the latest 50 jobs: {formatPaise(paise(cost))} (only where the provider reported a cost)</p>
      </div>

      <section className="mt-8 space-y-3" aria-labelledby="dev-h">
        <h2 id="dev-h" className="text-2xl">Kiosk screens</h2>
        <table className="w-full min-w-[32rem] text-left text-sm">
          <caption className="sr-only">Registered kiosk devices</caption>
          <thead className="border-b border-beige text-cocoa"><tr>{["Name", "Location", "Last seen", "Status"].map((h) => <th key={h} scope="col" className="py-2 pr-4">{h}</th>)}<th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} className="border-b border-beige"><td className="py-2 pr-4">{d.name}</td><td className="py-2 pr-4">{d.location ?? "–"}</td><td className="py-2 pr-4">{d.lastSeenAt?.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) ?? "never"}</td><td className="py-2 pr-4">{d.revokedAt ? "Revoked" : "Active"}</td>
                <td>{canWrite && !d.revokedAt ? <form action={revokeDeviceAction}><input type="hidden" name="id" value={d.id} /><Button type="submit" variant="ghost" className="min-h-9 px-2 text-xs text-danger">Revoke</Button></form> : null}</td></tr>
            ))}
            {devices.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-cocoa">No kiosk screens registered.</td></tr> : null}
          </tbody>
        </table>
        {canWrite ? <div className="max-w-md"><ActionForm action={createDeviceAction} submitLabel="Register a screen"><Field label="Name" name="name" required /><Field label="Location" name="location" /></ActionForm></div> : null}
      </section>

      {canWrite ? (
        <section className="mt-10 max-w-md space-y-3" aria-labelledby="cfg-h">
          <h2 id="cfg-h" className="text-2xl">Limits</h2>
          <ActionForm action={saveTryOnConfigAction} submitLabel="Save limits">
            <Field label="Kiosk idle timeout (seconds)" name="kioskIdleSeconds" type="number" defaultValue={cfg.kioskIdleSeconds} />
            <Field label="Longest a session may last (minutes)" name="sessionMaxMinutes" type="number" defaultValue={cfg.sessionMaxMinutes} />
            <Field label="Looks per visit" name="maxJobsPerSession" type="number" defaultValue={cfg.maxJobsPerSession} />
            <Field label="Looks per day, all screens" name="maxJobsPerDay" type="number" defaultValue={cfg.maxJobsPerDay} />
            <Field label="QR link lifetime (minutes)" name="continuationMinutes" type="number" defaultValue={cfg.continuationMinutes} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="onlineEnabled" defaultChecked={cfg.onlineEnabled} /> Offer try-on on the website (needs the AI service connected)</label>
          </ActionForm>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="jobs-h">
        <h2 id="jobs-h" className="text-2xl">Recent jobs</h2>
        <p className="text-xs text-cocoa">Customer photos are never shown here and are deleted when a session ends or expires.</p>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Recent try-on jobs</caption>
            <thead className="border-b border-beige text-cocoa"><tr>{["When", "Product", "Status", "Error", "Cost"].map((h) => <th key={h} scope="col" className="py-2 pr-4">{h}</th>)}</tr></thead>
            <tbody>
              {jobs.map((j) => <tr key={j.id} className="border-b border-beige"><td className="py-2 pr-4">{j.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td><td className="py-2 pr-4">{j.product.name}</td><td className="py-2 pr-4">{j.status.toLowerCase()}</td><td className="py-2 pr-4 font-mono text-xs">{j.errorCode ?? ""}</td><td className="py-2 pr-4">{j.costPaise === null ? "–" : formatPaise(paise(j.costPaise))}</td></tr>)}
              {jobs.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-cocoa">No try-on jobs yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
