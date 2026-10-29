import { getPrisma } from "@tanvi/database";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { CreateUserForm } from "@/features/auth/create-user-form";
import { setUserActiveAction } from "@/features/auth/user-actions";
import { requireAdmin } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const auth = await requireAdmin("users.read");
  const prisma = getPrisma();
  const [users, roles] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { roles: { include: { role: true } } }, take: 200 }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
  ]);
  const canWrite = auth.permissions.has("users.write");
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Users</h1>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <caption className="sr-only">Staff users</caption>
          <thead className="border-b border-beige text-cocoa">
            <tr>
              <th scope="col" className="py-2 pr-4">Name</th>
              <th scope="col" className="py-2 pr-4">Email</th>
              <th scope="col" className="py-2 pr-4">Role</th>
              <th scope="col" className="py-2 pr-4">2FA</th>
              <th scope="col" className="py-2 pr-4">Status</th>
              {canWrite ? <th scope="col" className="py-2"><span className="sr-only">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-beige">
                <td className="py-2 pr-4">{u.name}</td>
                <td className="py-2 pr-4">{u.email}</td>
                <td className="py-2 pr-4">{u.roles.map((r) => r.role.name).join(", ")}</td>
                <td className="py-2 pr-4">{u.mfaEnabledAt ? "On" : "Off"}</td>
                <td className="py-2 pr-4">{u.isActive ? "Active" : "Disabled"}</td>
                {canWrite ? (
                  <td className="py-2">
                    {u.id !== auth.user.id ? (
                      <form action={setUserActiveAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="active" value={String(!u.isActive)} />
                        <Button type="submit" variant="ghost">{u.isActive ? "Disable" : "Enable"}</Button>
                      </form>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canWrite ? (
        <section className="mt-10 space-y-4">
          <h2 className="text-2xl">Add a user</h2>
          <CreateUserForm roles={roles.map((r) => ({ key: r.key, name: r.name }))} />
        </section>
      ) : null}
    </AdminShell>
  );
}
