"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { loginAction, mfaAction, type FormState } from "./actions";

const initial: FormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label="Email" name="email" type="email" autoComplete="username" required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function MfaForm() {
  const [state, action, pending] = useActionState(mfaAction, initial);
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field
        label="Authentication code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        hint="Enter the 6-digit code from your authenticator app, or a recovery code."
        required
      />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Verifying…" : "Verify"}
      </Button>
    </form>
  );
}
