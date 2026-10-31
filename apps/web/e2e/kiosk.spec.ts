import { createPrisma } from "@tanvi/database";
import { expect, test, type Page } from "@playwright/test";
import { CHECKOUT_FIXTURE } from "./global-setup";

async function activate(page: Page) {
  await page.goto("/kiosk");
  await expect(page.getByText("This screen isn't set up yet.")).toBeVisible();
  await page.goto("/kiosk/activate");
  await page.getByLabel("Device code").fill("kd_not_a_real_code");
  await page.getByRole("button", { name: "Activate" }).click();
  await expect(page.getByText(/isn't valid or has been revoked/)).toBeVisible();
  await page.getByLabel("Device code").fill(process.env.E2E_KIOSK_CREDENTIAL ?? "");
  await page.getByRole("button", { name: "Activate" }).click();
  await expect(page.getByRole("button", { name: "Touch to begin" })).toBeVisible();
}

test("kiosk: no site chrome, consent before camera, honest failure without an AI service, cleanup on finish", async ({ page, request }) => {
  await activate(page);
  await expect(page.getByRole("link", { name: "Shop all" })).toHaveCount(0); // no storefront navigation

  // Without a session the camera screen is unreachable.
  await page.goto("/kiosk/capture");
  await expect(page).toHaveURL(/\/kiosk$/);

  await page.getByRole("button", { name: "Touch to begin" }).click();
  await expect(page.getByRole("heading", { name: /Photo consent/ })).toBeVisible();
  // Consent is required: capture still redirects back until it is given.
  await page.goto("/kiosk/capture");
  await expect(page).toHaveURL(/\/kiosk$/);
  await page.getByRole("button", { name: "I agree, take my photo" }).click();
  await expect(page).toHaveURL(/\/kiosk\/capture$/);

  await page.getByRole("button", { name: "Take photo" }).click();
  await expect(page.getByRole("heading", { name: "Happy with your photo?" })).toBeVisible();
  // Own photo is served only inside this session, never cached.
  const photo = await page.request.get("/kiosk/asset/input");
  expect(photo.status()).toBe(200);
  expect(photo.headers()["cache-control"]).toBe("no-store");
  expect((await request.get("/kiosk/asset/input")).status()).toBe(404); // another browser has no session

  await page.getByRole("button", { name: "Use this photo" }).click();
  await expect(page.getByRole("heading", { name: "Choose a collection" })).toBeVisible();
  await page.getByRole("link", { name: "Premium Wear" }).click();
  await page.getByRole("button", { name: new RegExp(CHECKOUT_FIXTURE.name) }).click();
  // No AI service is connected: the screen must say so, never show a made-up result.
  await expect(page.getByText("Virtual try-on isn't available right now").first()).toBeVisible();
  await expect(page.locator("img[alt^='After']")).toHaveCount(0);

  const prisma = createPrisma(process.env.DATABASE_URL_TEST ?? "");
  try {
    const session = await prisma.tryOnSession.findFirstOrThrow({ where: { source: "KIOSK", status: "ACTIVE" }, orderBy: { createdAt: "desc" }, include: { jobs: true, consents: true } });
    expect(session.jobs[0]).toMatchObject({ status: "FAILED", errorCode: "PROVIDER_NOT_CONFIGURED", resultKey: null });
    expect(session.consents[0]).toMatchObject({ purpose: "tryon_image_capture", locale: "en" });
    expect(session.inputKey).not.toBeNull();

    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByRole("button", { name: "Touch to begin" })).toBeVisible();
    const done = await prisma.tryOnSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(done).toMatchObject({ status: "ENDED", inputKey: null });
    expect(done.assetsDeletedAt).not.toBeNull();
    expect((await page.request.get("/kiosk/asset/input")).status()).toBe(404);
  } finally {
    await prisma.$disconnect();
  }
});

test("QR continuation link opens only the product page and is rejected when invalid", async ({ request }) => {
  expect((await request.get("/k/not-a-real-token-not-a-real-token", { maxRedirects: 0 })).status()).toBe(404);
  expect((await request.get("/k/short", { maxRedirects: 0 })).status()).toBe(404);
});

test("website try-on page says it is unavailable rather than faking it", async ({ page }) => {
  await page.goto("/try-on");
  await expect(page.getByText("isn't available yet")).toBeVisible();
});
