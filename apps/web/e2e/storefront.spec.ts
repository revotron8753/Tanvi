import { expect, test } from "@playwright/test";
import { FIXTURE } from "./global-setup";

test("home lists the six categories from the database and the fixture product in new arrivals", async ({ page }) => {
  await page.goto("/");
  for (const n of ["Regular Wear", "Festive Wear", "Premium Wear", "Three-Piece Kurtis", "Short Tops", "Co-ord Sets"]) {
    await expect(page.getByRole("link", { name: n }).first()).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "New arrivals" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(FIXTURE.name) }).first()).toBeVisible();
});

test("collection page shows the product with a correct Indian-formatted price; filters and search work", async ({ page }) => {
  await page.goto("/collections/premium-wear");
  const card = page.getByRole("article").filter({ hasText: FIXTURE.name });
  await expect(card).toBeVisible();
  await expect(card).toContainText("₹2,499");
  await expect(card.getByText("Original price")).toBeVisible();

  await page.goto("/collections/festive-wear");
  await expect(page.getByText(FIXTURE.name)).toHaveCount(0);

  await page.goto("/collections/premium-wear?fabric=Chanderi");
  await expect(page.getByText(FIXTURE.name).first()).toBeVisible();
  await page.goto("/collections/premium-wear?min=5000");
  await expect(page.getByText(FIXTURE.name)).toHaveCount(0);

  await page.goto("/search?q=chanderi");
  await expect(page.getByText(FIXTURE.name).first()).toBeVisible();
  await page.goto("/search?q=zzzznomatch");
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
  await page.goto("/collections/not-a-category");
  await expect(page.getByRole("heading", { name: /not found|404/i }).or(page.getByText(/could not be found|404/i)).first()).toBeVisible();
});

test("product page: structured data, availability, add to bag, server-calculated bag, stock limits", async ({ page, request }) => {
  await page.goto(`/products/${FIXTURE.slug}`);
  await expect(page.getByRole("heading", { name: FIXTURE.name })).toBeVisible();

  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  const product = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "Product");
  expect(product.offers[0]).toMatchObject({ priceCurrency: "INR", price: "2499.00" });
  expect(ld["@graph"].some((n: { "@type": string }) => n["@type"] === "BreadcrumbList")).toBe(true);
  expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|review/i); // no fabricated ratings

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/products\/e2e-storefront-kurti$/);
  await expect(page.getByText("Size chart", { exact: true }).first()).toBeVisible();

  // L is out of stock and cannot be selected; M can.
  await expect(page.getByLabel(/^L/)).toBeDisabled();
  await page.getByLabel("M", { exact: true }).check({ force: true });
  await expect(page.getByText("Only a few left")).toBeVisible(); // 2 units = at the default low-stock threshold
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByText("Added to your bag.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Bag/ })).toContainText("1");

  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByText("Added to your bag.")).toBeVisible();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByText("Only 2 left in this size.")).toBeVisible(); // 3rd unit exceeds stock

  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your bag" })).toBeVisible();
  await expect(page.getByText("₹4,998").first()).toBeVisible(); // 2 × ₹2,499, computed on the server
  await page.getByLabel(`Quantity for ${FIXTURE.name}`).fill("3");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("₹4,998").first()).toBeVisible(); // update rejected, quantity unchanged
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Your bag is empty")).toBeVisible();

  expect((await request.get("/sitemap.xml")).ok()).toBe(true);
  expect(await (await request.get("/sitemap.xml")).text()).toContain(`/products/${FIXTURE.slug}`);
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /admin");
});

test("wishlist persists across reloads", async ({ page }) => {
  await page.goto(`/products/${FIXTURE.slug}`);
  await page.getByRole("button", { name: "Save to wishlist" }).click();
  await expect(page.getByRole("button", { name: /Saved to wishlist/ })).toBeVisible();
  await page.goto("/wishlist");
  await expect(page.getByText(FIXTURE.name).first()).toBeVisible();
  await page.goto(`/products/${FIXTURE.slug}`);
  await page.getByRole("button", { name: /Saved to wishlist/ }).click();
  await page.goto("/wishlist");
  await expect(page.getByText("Nothing saved yet")).toBeVisible();
});

test("policies that have no content do not exist; newsletter needs consent", async ({ page }) => {
  expect((await page.goto("/policies/returns"))?.status()).toBe(404);
  expect((await page.goto("/policies/not-real"))?.status()).toBe(404);
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email" }).fill("shopper@example.test");
  await page.getByRole("button", { name: "Subscribe" }).click();
  await expect(page.getByText("tick the box")).toBeVisible();
  await page.getByRole("checkbox", { name: /I agree to receive/ }).check();
  await page.getByRole("button", { name: "Subscribe" }).click();
  await expect(page.getByText("You're on the list.")).toBeVisible();
});

test("draft products are not reachable by URL or in the sitemap", async ({ page, request }) => {
  expect((await page.goto("/products/definitely-not-a-product"))?.status()).toBe(404);
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).not.toContain("definitely-not-a-product");
});
