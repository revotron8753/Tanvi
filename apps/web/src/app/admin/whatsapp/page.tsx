import { getPrisma } from "@tanvi/database";
import { ORDER_EVENTS, ORDER_VARIABLES } from "@tanvi/validation";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { Field } from "@/components/ui/field";
import { saveWhatsAppConfigAction } from "@/features/orders/whatsapp-actions";
import { requireAdmin } from "@/server/auth/guard";
import { getWhatsAppProvider } from "@/server/messaging/instance";
import { getWhatsAppConfig } from "@/server/messaging/outbox";

export const dynamic = "force-dynamic";
const mask = (p: string) => `${p.slice(0, 4)}••••${p.slice(-3)}`;

export default async function WhatsAppPage() {
  const auth = await requireAdmin("whatsapp.read");
  const prisma = getPrisma();
  const [cfg, counts, recent] = await Promise.all([
    getWhatsAppConfig(prisma),
    prisma.outboxMessage.groupBy({ by: ["status"], _count: true }),
    prisma.outboxMessage.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const provider = getWhatsAppProvider();
  const canWrite = auth.permissions.has("settings.write");
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">WhatsApp messages</h1>
      <p role="status" className={`mt-3 rounded-sm border p-3 text-sm ${provider ? "border-success" : "border-danger text-danger"}`}>
        {provider ? `Provider connected: ${provider.name}` : "No WhatsApp provider is connected. Notifications are recorded below and held; nothing is being sent. A provider adapter must be added from your provider's documentation."}
      </p>
      <ul className="mt-4 flex flex-wrap gap-4 text-sm">
        {["PENDING", "SENT", "FAILED", "DEAD", "SKIPPED"].map((s) => <li key={s}>{s.toLowerCase()}: <strong>{counts.find((c) => c.status === s)?._count ?? 0}</strong></li>)}
      </ul>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <caption className="sr-only">Recent notification messages</caption>
          <thead className="border-b border-beige text-cocoa"><tr>{["When", "Event", "To", "Template", "Status", "Attempts", "Note"].map((h) => <th key={h} scope="col" className="py-2 pr-4">{h}</th>)}</tr></thead>
          <tbody>
            {recent.map((m) => (
              <tr key={m.id} className="border-b border-beige">
                <td className="py-2 pr-4">{m.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                <td className="py-2 pr-4">{m.event}</td><td className="py-2 pr-4 font-mono text-xs">{mask(m.toPhone)}</td>
                <td className="py-2 pr-4">{m.templateName ?? "–"}</td><td className="py-2 pr-4">{m.status.toLowerCase()}</td>
                <td className="py-2 pr-4">{m.attempts}</td><td className="py-2 pr-4 text-xs">{m.lastError ?? ""}</td>
              </tr>
            ))}
            {recent.length === 0 ? <tr><td colSpan={7} className="py-8 text-center text-cocoa">No messages yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {canWrite ? (
        <section className="mt-10 max-w-3xl" aria-labelledby="cfg-h">
          <h2 id="cfg-h" className="text-2xl">Templates and test mode</h2>
          <p className="mt-1 text-sm text-cocoa">Enter template names and languages exactly as approved by your provider. Leave a name empty to turn that notification off. These are only used once a provider is connected.</p>
          <ActionForm action={saveWhatsAppConfigAction} submitLabel="Save">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="testMode" defaultChecked={cfg.testMode} /> Test mode: send only to the numbers below</label>
            <Field label="Allowed test numbers (10 digits or with 91, separated by commas or spaces)" name="allowedNumbers" defaultValue={cfg.allowedNumbers.join(", ")} />
            {ORDER_EVENTS.map((ev) => {
              const t = cfg.templates[ev];
              return (
                <fieldset key={ev} className="space-y-2 border-t border-beige pt-3">
                  <legend className="font-medium">{ev}</legend>
                  <div className="grid gap-3 sm:grid-cols-2"><Field label="Template name" name={`${ev}.name`} defaultValue={t?.name ?? ""} /><Field label="Language" name={`${ev}.language`} defaultValue={t?.language ?? "en"} /></div>
                  <div className="flex flex-wrap gap-4 text-sm">{ORDER_VARIABLES.map((v) => <label key={v} className="flex items-center gap-1"><input type="checkbox" name={`${ev}.var.${v}`} defaultChecked={t?.variables.includes(v)} /> {v}</label>)}</div>
                </fieldset>
              );
            })}
          </ActionForm>
        </section>
      ) : null}
    </AdminShell>
  );
}
