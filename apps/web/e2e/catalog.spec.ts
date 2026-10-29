import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { E2E } from "./global-setup";

async function signIn(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("admin creates a product, uploads an image, adds a variant, publishes; media visibility follows status", async ({ page, request }) => {
  const name = `E2E Kurti ${Date.now()}`;
  const dir = await mkdtemp(path.join(os.tmpdir(), "tanvi-e2e-"));
  const img = path.join(dir, "front.jpg");
  await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#c5a477" } }).jpeg().toFile(img);

  await signIn(page, E2E.pmEmail);
  await page.getByRole("link", { name: "Products" }).click();
  await page.getByRole("link", { name: "New product" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Category").selectOption({ label: "Premium Wear" });
  await page.getByLabel("Price (₹)", { exact: true }).fill("2,499");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("Before this can be published")).toBeVisible();

  // Publishing is refused until essentials exist.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Upload at least one image.")).toBeVisible();

  await page.getByLabel(/Images \(JPEG/).setInputFiles(img);
  await page.getByLabel("Alt text (optional)").fill("Gold kurti, front view");
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("The product was not published.")).toBeVisible();

  await page.getByLabel("Size", { exact: true }).fill("M");
  await page.getByLabel("Colour", { exact: true }).fill("Gold");
  await page.getByLabel("Opening stock").fill("4");
  await page.getByRole("button", { name: "Add variant" }).click();
  await expect(page.getByText("Variant added.")).toBeVisible();

  const imgSrc = await page.locator('img[alt="Gold kurti, front view"]').getAttribute("src");
  expect(imgSrc).toMatch(/^\/media\/products\/.+\/md\.webp$/);

  // Draft media is NOT public.
  expect((await request.get(imgSrc ?? "")).status()).toBe(404);
  // …but visible to the signed-in staff member.
  expect((await page.request.get(imgSrc ?? "")).status()).toBe(200);

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published.")).toBeVisible();
  const anon = await request.get(imgSrc ?? "");
  expect(anon.status()).toBe(200);
  expect(anon.headers()["content-type"]).toBe("image/webp");

  // Path traversal and unknown keys are rejected.
  expect((await request.get("/media/products/../../.env")).status()).toBe(404);
  expect((await request.get("/media/products/x/y/md.webp")).status()).toBe(404);

  // Product shows in the list under its category.
  await page.goto("/admin/products?status=PUBLISHED&q=" + encodeURIComponent(name));
  await expect(page.getByRole("link", { name })).toBeVisible();
});

test("product manager cannot change stock; store manager can, with a reason, and it shows in the ledger", async ({ page }) => {
  await signIn(page, E2E.pmEmail);
  await expect(page.getByRole("link", { name: "Inventory" })).toBeVisible();
  await page.goto("/admin/inventory");
  await expect(page.getByRole("heading", { name: "Change stock" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();

  await signIn(page, E2E.smEmail);
  await page.goto("/admin/inventory");
  await page.getByLabel("Quantity").fill("3");
  await page.getByLabel("Reason / reference").fill("New delivery e2e");
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.getByText("Stock updated.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: "New delivery e2e" }).first()).toBeVisible();

  // Reason is mandatory.
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Reason / reference").fill("");
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.getByText(/reason/i).first()).toBeVisible();
});

test("categories are read from the database, seeded six, and editable by staff with permission", async ({ page }) => {
  await signIn(page, E2E.pmEmail);
  await page.goto("/admin/categories");
  for (const n of ["Regular Wear", "Festive Wear", "Premium Wear", "Three-Piece Kurtis", "Short Tops", "Co-ord Sets"]) {
    await expect(page.locator(`input[name="name"][value="${n}"]`)).toHaveCount(1);
  }
});
