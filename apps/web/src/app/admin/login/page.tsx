import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/login-form";
import { getAuth } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const auth = await getAuth();
  if (auth?.mfaVerified) redirect("/admin");
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="font-display text-3xl tracking-[0.25em]">TANVI</p>
          <h1 className="mt-2 text-lg text-cocoa">Admin sign in</h1>
        </div>
        <LoginForm />
      </Card>
    </main>
  );
}
