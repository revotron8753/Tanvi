"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { FormState } from "./actions";
import { createUserAction } from "./user-actions";

export function CreateUserForm({ roles }: { roles: ReadonlyArray<{ key: string; name: string }> }) {
  const [state, action, pending] = useActionState(createUserAction, {} as FormState);
  return (
    <form action={action} className="max-w-sm space-y-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.ok}</Alert> : null}
      <Field label="Name" name="name" required />
      <Field label="Email" name="email" type="email" required />
      <Field label="Temporary password" name="password" type="password" autoComplete="new-password" hint="At least 12 characters. Share it securely." required />
      <div className="space-y-1.5">
        <label htmlFor="roleKey" className="block text-sm font-medium">Role</label>
        <select id="roleKey" name="roleKey" className="min-h-11 w-full rounded-sm border border-taupe bg-white px-3" required>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create user"}
      </Button>
    </form>
  );
}
