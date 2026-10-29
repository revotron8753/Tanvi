import type { ReactNode, SelectHTMLAttributes } from "react";

export function Select({ label, name, children, ...rest }: { label: string; name: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-espresso">
        {label}
      </label>
      <select id={name} name={name} className="min-h-11 w-full rounded-sm border border-taupe bg-white px-3 text-espresso" {...rest}>
        {children}
      </select>
    </div>
  );
}

export function Textarea({ label, name, ...rest }: { label: string; name: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-espresso">
        {label}
      </label>
      <textarea id={name} name={name} rows={4} className="w-full rounded-sm border border-taupe bg-white px-3 py-2 text-espresso" {...rest} />
    </div>
  );
}
