import { expect, test } from "@playwright/test";
import { totpAt } from "../src/server/auth/totp";
import { E2E } from "./global-setup";

async function signIn(page: import("@playwright/test").Page, email: string, password = E2E.password) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("unauthenticated visitors are redirected away from every admin page", async ({ page }) => {
  for (const path of ["/admin", "/admin/users", "/admin/security", "/admin/mfa"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/login$/);
  }
});

test("wrong password shows a generic error and no session", async ({ page }) => {
  await signIn(page, E2E.pmEmail, "definitely the wrong password");
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("product manager signs in; /admin/users is denied by the server (403), not just hidden", async ({ page }) => {
  await signIn(page, E2E.pmEmail);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  const res = await page.goto("/admin/users");
  expect(res?.status()).toBe(403);
  await expect(page.getByRole("heading", { name: "Not authorised" })).toBeVisible();
});

test("super admin must pass MFA, can manage users, and sign-out ends the session", async ({ page }) => {
  await signIn(page, E2E.saEmail);
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  // Half-authenticated session cannot reach the console.
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/admin\/mfa$/);

  const secret = process.env.E2E_SA_TOTP_SECRET ?? "";
  await page.getByLabel("Authentication code").fill(totpAt(secret, Date.now()));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole("link", { name: "Users" }).click();
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await expect(page.getByRole("cell", { name: E2E.pmEmail })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("security headers are present and the session cookie is HttpOnly", async ({ page }) => {
  const res = await page.goto("/admin/login");
  const h = res?.headers() ?? {};
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["strict-transport-security"]).toContain("max-age");
  expect(h["x-powered-by"]).toBeUndefined();
  await signIn(page, E2E.pmEmail);
  await expect(page).toHaveURL(/\/admin$/);
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name.endsWith("tanvi_session"));
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
});
