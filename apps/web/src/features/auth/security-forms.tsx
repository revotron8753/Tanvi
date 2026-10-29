"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { beginMfaAction, changePasswordAction, confirmMfaAction, type FormState } from "./actions";

const initial: FormState = {};

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);
  return (
    <form action={action} className="max-w-sm space-y-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.ok}</Alert> : null}
      <Field label="Current password" name="current" type="password" autoComplete="current-password" required />
      <Field label="New password" name="next" type="password" autoComplete="new-password" hint="At least 12 characters." required />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}

export function MfaEnrol() {
  const [begin, setBegin] = useState<FormState>({});
  const [pendingBegin, startBegin] = useTransition();
  const [state, action, pending] = useActionState(confirmMfaAction, initial);

  if (state.recoveryCodes) {
    return (
      <div className="max-w-sm space-y-3">
        <Alert tone="success">{state.ok}</Alert>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm" aria-label="Recovery codes">
          {state.recoveryCodes.map((c) => (
            <li key={c} className="rounded-sm border border-beige bg-white px-2 py-1">
              {c}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="max-w-sm space-y-4">
      {!begin.secret ? (
        <Button
          disabled={pendingBegin}
          onClick={() => startBegin(async () => setBegin(await beginMfaAction()))}
        >
          {pendingBegin ? "Preparing…" : "Set up authenticator app"}
        </Button>
      ) : (
        <form action={action} className="space-y-4" noValidate>
          <p className="text-sm text-espresso">
            Add this key to an authenticator app (Google Authenticator, Authy, 1Password…), then enter the 6-digit code.
          </p>
          <p className="break-all rounded-sm border border-beige bg-white p-3 font-mono text-sm">{begin.secret}</p>
          <a className="text-sm text-cocoa underline" href={begin.otpauth}>
            Open in authenticator app
          </a>
          {state.error ? <Alert>{state.error}</Alert> : null}
          <Field label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
          <Button type="submit" disabled={pending}>
            {pending ? "Verifying…" : "Turn on two-factor"}
          </Button>
        </form>
      )}
      {begin.error ? <Alert>{begin.error}</Alert> : null}
    </div>
  );
}
