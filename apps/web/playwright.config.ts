import { defineConfig } from "@playwright/test";

const PORT = 3100;
const testDb = process.env.DATABASE_URL_TEST;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/admin/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: testDb ?? "",
      APP_ENCRYPTION_KEY: process.env.E2E_ENCRYPTION_KEY ?? "",
      APP_HASH_SECRET: "e2e-hash-secret-e2e-hash-secret-e2e-hash",
    },
  },
});
