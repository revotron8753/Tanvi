import type { ReactNode } from "react";
import { StoreFooter, StoreHeader } from "@/features/shop/shell";

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:bg-white focus:p-2">
        Skip to content
      </a>
      <StoreHeader />
      <main id="main" className="mx-auto max-w-7xl px-4 py-8">
        {children}
      </main>
      <StoreFooter />
    </>
  );
}
