import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Tanvi Mirror", robots: { index: false, follow: false } };

// Dedicated kiosk shell: no site header, footer or navigation.
export default function KioskLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen select-none bg-espresso text-ivory [&_button]:min-h-14 [&_button]:text-lg">{children}</div>;
}
