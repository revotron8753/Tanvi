import type { PermissionKey } from "@tanvi/domain";
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/features/auth/actions";
import type { SessionUser } from "@/server/auth/service";
import { Button } from "./ui/button";

const NAV: ReadonlyArray<{ href: string; label: string; permission: PermissionKey }> = [
  { href: "/admin", label: "Overview", permission: "dashboard.view" },
  { href: "/admin/products", label: "Products", permission: "products.read" },
  { href: "/admin/categories", label: "Categories", permission: "categories.read" },
  { href: "/admin/inventory", label: "Inventory", permission: "inventory.read" },
  { href: "/admin/orders", label: "Orders", permission: "orders.read" },
  { href: "/admin/customers", label: "Customers", permission: "customers.read" },
  { href: "/admin/campaigns", label: "Coupons", permission: "campaigns.write" },
  { href: "/admin/whatsapp", label: "WhatsApp", permission: "whatsapp.read" },
  { href: "/admin/try-on-sessions", label: "Try-on", permission: "tryon.read" },
  { href: "/admin/reports", label: "Reports", permission: "reports.read" },
  { href: "/admin/content", label: "Content", permission: "content.write" },
  { href: "/admin/journal", label: "Journal", permission: "content.write" },
  { href: "/admin/reviews", label: "Reviews", permission: "content.write" },
  { href: "/admin/settings", label: "Settings", permission: "settings.read" },
  { href: "/admin/audit", label: "Audit log", permission: "audit.read" },
  { href: "/admin/users", label: "Users", permission: "users.read" },
];

export function AdminShell({ auth, children }: { auth: SessionUser; children: ReactNode }) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[14rem_1fr]">
      <aside className="border-b border-beige bg-white p-5 md:border-b-0 md:border-r">
        <p className="font-display text-2xl tracking-[0.2em] text-espresso">TANVI</p>
        <p className="mt-1 text-xs text-cocoa">Admin Studio</p>
        <nav aria-label="Admin" className="mt-6 flex gap-4 md:flex-col md:gap-2">
          {NAV.filter((n) => auth.permissions.has(n.permission)).map((n) => (
            <Link key={n.href} href={n.href} className="py-1 text-sm text-espresso underline-offset-4 hover:underline">
              {n.label}
            </Link>
          ))}
          <Link href="/admin/security" className="py-1 text-sm text-espresso underline-offset-4 hover:underline">
            Security
          </Link>
        </nav>
      </aside>
      <div>
        <header className="flex items-center justify-between border-b border-beige bg-white px-6 py-3">
          <p className="text-sm text-cocoa">
            {auth.user.name} · {auth.roleKeys.join(", ")}
          </p>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </header>
        <main className="p-6 md:p-10">{children}</main>
      </div>
    </div>
  );
}
