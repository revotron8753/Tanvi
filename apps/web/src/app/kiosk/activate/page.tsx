import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { activateDeviceAction } from "@/features/tryon/kiosk-actions";

export const dynamic = "force-dynamic";

export default function ActivatePage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-md place-items-center p-6">
      <div className="w-full space-y-4 rounded-sm bg-ivory p-6 text-espresso">
        <h1 className="text-3xl">Set up this screen</h1>
        <p className="text-sm">Staff only. Enter the device code created in Admin → Try-on.</p>
        <ActionForm action={activateDeviceAction} submitLabel="Activate">
          <Field label="Device code" name="credential" autoComplete="off" required />
        </ActionForm>
      </div>
    </main>
  );
}
