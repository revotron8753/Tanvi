import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

// Intentionally NOT where authorisation happens: layouts do not re-run on client navigation.
// Every admin page and action calls requireAdmin() itself.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
