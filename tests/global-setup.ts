import { execFileSync } from "node:child_process";

/** Applies migrations to the dedicated TEST database before DB-backed tests. Never touches the dev DB. */
export default function setup(): void {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    // Pure unit tests still run; DB tests skip themselves when this is missing.
    return;
  }
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error("DATABASE_URL_TEST must point at a database whose name contains 'test'");
  }
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: "packages/database",
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
