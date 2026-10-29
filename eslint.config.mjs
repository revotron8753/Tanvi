import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "eslint-config-next";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/generated/**", "**/.pgdata/**", "**/playwright-report/**", "next-env.d.ts", "**/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  {
    settings: { next: { rootDir: "apps/web" } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // CLI scripts may print to stdout.
    files: ["**/scripts/**", "**/seed.ts", "tests/**"],
    rules: { "no-console": "off" },
  },
  {
    // Module boundary: UI/route code never imports the Prisma client directly except via @tanvi/database in server files.
    files: ["apps/web/src/components/**", "packages/ui/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["@tanvi/database", "@prisma/*", "**/generated/**"] }],
    },
  },
);
