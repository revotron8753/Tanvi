import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { CHECKOUT_FIXTURE, E2E, FIXTURE } from "./global-setup";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function audit(page: import("@playwright/test").Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(summary, `${label} has WCAG A/AA violations`).toEqual([]);
}

test.describe("accessibility (axe, WCAG 2.1 A/AA)", () => {
  for (const [name, path] of [
    ["home", "/"],
    ["collection", "/collections/premium-wear?q=E2E+Storefront"],
    ["product", `/products/${FIXTURE.slug}`],
    ["search", "/search?q=kurti"],
    ["empty cart", "/cart"],
    ["wishlist", "/wishlist"],
    ["journal", "/journal"],
    ["admin login", "/admin/login"],
  ] as const) {
    test(name, async ({ page }) => {
      await page.goto(path);
      await audit(page, name);
    });
  }

  test("cart with items, checkout form", async ({ page }) => {
    await page.goto(`/products/${CHECKOUT_FIXTURE.slug}`);
    await page.getByLabel("M", { exact: true }).check({ force: true });
    await page.getByRole("button", { name: "Add to bag" }).click();
    await expect(page.getByText("Added to your bag.")).toBeVisible();
    await page.goto("/cart");
    await audit(page, "cart");
    await page.goto("/checkout");
    await audit(page, "checkout");
  });

  test("admin pages", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(E2E.smEmail);
    await page.getByLabel("Password").fill(E2E.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    for (const p of ["/admin", "/admin/products", "/admin/inventory", "/admin/orders", "/admin/orders/new", "/admin/reports", "/admin/categories", "/admin/settings"]) {
      await page.goto(p);
      await audit(page, p);
    }
  });
});
