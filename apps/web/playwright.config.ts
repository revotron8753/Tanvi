import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// Shared by the app server and global setup so fixture images are served by the app under test.
process.env.E2E_STORAGE_DIR ??= path.join(os.tmpdir(), "tanvi-e2e-uploads");

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
      STORAGE_LOCAL_DIR: process.env.E2E_STORAGE_DIR,
      SITE_URL: "http://localhost:3100",
      RAZORPAY_KEY_ID: "rzp_test_e2e",
      RAZORPAY_KEY_SECRET: "e2e_secret",
      RAZORPAY_WEBHOOK_SECRET: "e2e_whsec",
      RAZORPAY_API_BASE_URL: "http://localhost:3199",
      CRON_SECRET: "e2e-cron-secret-e2e-cron-secret",
      APP_HASH_SECRET: "e2e-hash-secret-e2e-hash-secret-e2e-hash",
    },
  },
});
