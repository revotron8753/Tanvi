import type { ReactNode } from "react";
import { StoreFooter, StoreHeader } from "@/features/shop/shell";

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    // Full-height column: <main> grows, so the footer sits at the bottom of the window on short pages
    // instead of leaving empty page background underneath it.
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:bg-white focus:p-2">
        Skip to content
      </a>
      <StoreHeader />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-20 pt-8">
        {children}
      </main>
      <StoreFooter />
    </div>
  );
}
