import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { MfaForm } from "@/features/auth/login-form";
import { requireAdmin } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const auth = await requireAdmin(undefined, { allowUnverifiedMfa: true, allowPendingSetup: true });
  if (auth.mfaVerified) redirect("/admin");
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl">Two-factor authentication</h1>
        <MfaForm />
      </Card>
    </main>
  );
}
