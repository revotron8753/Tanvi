import { getPrisma } from "@tanvi/database";
import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const auth = await requireAdmin("audit.read");
  const action = (await searchParams).action?.trim();
  const logs = await getPrisma().auditLog.findMany({ where: action ? { action: { startsWith: action } } : {}, orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { name: true, email: true } } } });
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Audit log</h1>
      <form className="mt-4 flex items-end gap-3" role="search">
        <label className="text-sm">Action starts with<input name="action" defaultValue={action} placeholder="e.g. auth. or order." className="mt-1 block min-h-11 rounded-sm border border-taupe bg-white px-3" /></label>
        <button className="min-h-11 rounded-sm border border-espresso px-5 text-sm hover:bg-beige">Filter</button>
      </form>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Most recent 200 audit events</caption>
          <thead className="border-b border-beige text-cocoa"><tr>{["When", "Who", "Action", "Entity"].map((h) => <th key={h} scope="col" className="py-2 pr-4">{h}</th>)}</tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-beige">
                <td className="py-2 pr-4">{l.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                <td className="py-2 pr-4">{l.actor?.name ?? "system / unknown"}</td>
                <td className="py-2 pr-4 font-mono text-xs">{l.action}</td>
                <td className="py-2 pr-4 text-xs">{l.entityType ? `${l.entityType} ${l.entityId?.slice(0, 8) ?? ""}` : "–"}</td>
              </tr>
            ))}
            {logs.length === 0 ? <tr><td colSpan={4} className="py-8 text-center text-cocoa">No events.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
