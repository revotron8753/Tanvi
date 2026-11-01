import type { ReactNode } from "react";

export default function InnerLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-10">{children}</div>;
}
