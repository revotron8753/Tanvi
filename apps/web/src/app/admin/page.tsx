import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const auth = await requireAdmin("dashboard.view");
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Welcome, {auth.user.name}</h1>
      <p className="mt-3 max-w-prose text-cocoa">
        Products, inventory and orders arrive in the next phases. No figures are shown here until real records exist.
      </p>
    </AdminShell>
  );
}
