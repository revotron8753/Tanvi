"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface ActionState {
  error?: string;
  ok?: string;
}

/** A form bound to a server action with inline success/error feedback. */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  children,
  className = "space-y-4",
  variant = "primary",
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  children?: ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  const ref = useRef<HTMLFormElement>(null);
  // Submit through a transition instead of <form action>, because React 19 clears every field after an
  // action finishes, which would wipe what the person typed when the server reports a validation error.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} onSubmit={onSubmit} className={className} noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.ok}</Alert> : null}
      {children}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? (pendingLabel ?? "Saving…") : submitLabel}
      </Button>
    </form>
  );
}
