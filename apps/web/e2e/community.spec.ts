import { expect, test, type Page } from "@playwright/test";
import { E2E, FIXTURE } from "./global-setup";

async function signIn(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("a review stays hidden until staff approve it, then appears on the product page", async ({ browser }) => {
  const unique = `Quiet drape ${Date.now()}`;
  const shopper = await browser.newPage();
  await shopper.goto(`/products/${FIXTURE.slug}`);
  const form = shopper.locator("form").filter({ has: shopper.getByRole("button", { name: "Submit review" }) });
  await form.getByLabel("5", { exact: true }).check();
  await form.getByLabel("Your name").fill("Meera");
  await form.getByLabel("Email").fill(`meera-${Date.now()}@example.test`);
  await form.getByLabel("Headline (optional)").fill(unique);
  await form.getByLabel("Your review").fill("The fabric falls beautifully and the fit is true to size.");
  await form.getByRole("button", { name: "Submit review" }).click();
  await expect(shopper.getByText("Your review will appear once we've read it.")).toBeVisible();
  await shopper.reload();
  await expect(shopper.getByText(unique)).toHaveCount(0);

  const staff = await browser.newPage();
  await signIn(staff, E2E.mmEmail);
  await staff.goto("/admin/reviews");
  const card = staff.locator("li").filter({ hasText: unique });
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card.getByText(/approved/)).toBeVisible();

  await shopper.reload();
  await expect(shopper.getByText(unique)).toBeVisible();
});

test("journal: a draft is private; a published post is public", async ({ browser, request }) => {
  const title = `Weaving notes ${Date.now()}`;
  const staff = await browser.newPage();
  await signIn(staff, E2E.mmEmail);
  await staff.goto("/admin/journal");
  const create = staff.locator("section").filter({ has: staff.getByRole("heading", { name: "Write a post" }) });
  await create.getByLabel("Title").fill(title);
  await create.getByLabel("Post").fill("First paragraph.\n\nSecond paragraph.");
  await create.getByRole("button", { name: "Create post" }).click();
  await expect(create.getByText("Post created.")).toBeVisible();

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  expect((await request.get(`/journal/${slug}`)).status()).toBe(404);

  await staff.reload();
  const card = staff.locator("form").filter({ has: staff.locator(`input[name="title"][value="${title}"]`) });
  await card.getByLabel("Published").check();
  await card.getByRole("button", { name: "Save post" }).click();
  await expect(card.getByText("Saved.")).toBeVisible();

  const res = await request.get(`/journal/${slug}`);
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("Second paragraph.");
});
