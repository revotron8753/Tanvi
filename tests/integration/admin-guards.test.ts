import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural check: authorisation must be enforced on the server in EVERY admin page, route handler and
 * server action. Layouts are not a guard (they don't re-run on client navigation).
 */
const WEB_SRC = path.resolve(__dirname, "../../apps/web/src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(WEB_SRC);

// Pages that must be reachable without a full session.
const PUBLIC_ADMIN_PAGES = new Set(["admin/login/page.tsx"]);
// "use server" exports that are intentionally callable pre-auth (they authenticate themselves).
const PRE_AUTH_ACTIONS = new Set(["loginAction", "logoutAction"]);

describe("admin authorisation coverage", () => {
  const rel = (f: string) => path.relative(path.join(WEB_SRC, "app"), f);

  it("every admin page calls requireAdmin (or is an explicit public page)", () => {
    const pages = files.filter((f) => /app\/admin\/.*page\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThan(3);
    for (const page of pages) {
      if (PUBLIC_ADMIN_PAGES.has(rel(page))) continue;
      expect(readFileSync(page, "utf8"), `${rel(page)} must call requireAdmin()`).toMatch(/requireAdmin\(/);
    }
  });

  it("no route handler under /admin or /api lacks a guard", () => {
    const routes = files.filter((f) => /app\/(admin|api)\/.*route\.ts$/.test(f));
    for (const route of routes) {
      expect(readFileSync(route, "utf8"), `${rel(route)} must call requireAdmin()`).toMatch(/requireAdmin\(|requirePermissionForAction\(/);
    }
  });

  it("every exported server action authorises, except the allow-listed pre-auth ones", () => {
    const actionFiles = files.filter((f) => /\.tsx?$/.test(f) && /^\s*["']use server["']/.test(readFileSync(f, "utf8")));
    expect(actionFiles.length).toBeGreaterThan(0);
    for (const file of actionFiles) {
      const src = readFileSync(file, "utf8");
      const parts = src.split(/export async function /).slice(1);
      for (const part of parts) {
        const name = part.slice(0, part.indexOf("("));
        if (PRE_AUTH_ACTIONS.has(name)) continue;
        const body = part.slice(0, part.search(/\n}\n/) === -1 ? undefined : part.search(/\n}\n/));
        expect(body, `${path.basename(file)}:${name} must call requireAdmin/requirePermissionForAction`).toMatch(
          /requireAdmin\(|requirePermissionForAction\(/,
        );
      }
    }
  });

  it("server-only modules never reach client components", () => {
    const clientFiles = files.filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
    for (const file of clientFiles) {
      expect(readFileSync(file, "utf8"), `${path.basename(file)} must not import server code`).not.toMatch(
        /@tanvi\/database|@\/server\//,
      );
    }
  });
});
