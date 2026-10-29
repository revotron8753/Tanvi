import type { InputHTMLAttributes, ReactNode } from "react";

export function Field({
  label,
  name,
  error,
  hint,
  ...input
}: { label: string; name: string; error?: string | undefined; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const errId = `${name}-error`;
  const hintId = `${name}-hint`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-espresso">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined}
        className="min-h-11 w-full rounded-sm border border-taupe bg-white px-3 text-espresso placeholder:text-cocoa/70"
        {...input}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-cocoa">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
