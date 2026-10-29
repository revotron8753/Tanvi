import { AdminShell } from "@/components/admin-shell";
import { Alert } from "@/components/ui/alert";
import { MfaEnrol, PasswordForm } from "@/features/auth/security-forms";
import { requireAdmin } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const auth = await requireAdmin(undefined, { allowPendingSetup: true });
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Account security</h1>
      <div className="mt-6 space-y-3">
        {auth.mustEnrolMfa ? <Alert tone="info">Two-factor authentication is required for your role. Set it up to continue.</Alert> : null}
        {auth.user.mustChangePassword ? <Alert tone="info">Please choose a new password to continue.</Alert> : null}
      </div>
      <section className="mt-8 space-y-4">
        <h2 className="text-2xl">Password</h2>
        <PasswordForm />
      </section>
      <section className="mt-10 space-y-4">
        <h2 className="text-2xl">Two-factor authentication</h2>
        {auth.user.mfaEnabled ? <p className="text-cocoa">Two-factor authentication is on.</p> : <MfaEnrol />}
      </section>
    </AdminShell>
  );
}
