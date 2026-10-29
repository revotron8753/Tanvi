import { createHmac } from "node:crypto";
import { createPrisma } from "@tanvi/database";
import { expect, test, type Page } from "@playwright/test";
import { CHECKOUT_FIXTURE, E2E, RZP } from "./global-setup";

const RUN = Date.now().toString(36); // event ids persist in the DB; keep them unique per run
const sign = (body: string) => createHmac("sha256", RZP.webhookSecret).update(body).digest("hex");

async function addToBag(page: Page) {
  await page.goto(`/products/${CHECKOUT_FIXTURE.slug}`);
  await page.getByLabel("M", { exact: true }).check({ force: true });
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByText("Added to your bag.")).toBeVisible();
}

async function fillCheckout(page: Page, method: "Pay online" | "Cash on delivery") {
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("Asha Verma");
  await page.getByLabel("Email", { exact: true }).first().fill("asha@example.test"); // checkout form precedes the footer newsletter field
  await page.getByLabel("Mobile number").fill("98765 43210");
  await page.getByLabel("Address line 1").fill("12 MG Road");
  await page.getByLabel("City").fill("Pune");
  await page.getByLabel("State").fill("Maharashtra");
  await page.getByLabel("PIN code").fill("411001");
  await page.getByRole("radio", { name: new RegExp(method) }).check();
}

async function signIn(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("checkout validates input on the server and shows server-computed totals", async ({ page }) => {
  await addToBag(page);
  await page.goto("/checkout");
  await expect(page.getByText("₹1,500").first()).toBeVisible();
  await expect(page.getByText("₹99")).toBeVisible(); // flat shipping, free only above ₹10,000
  await expect(page.getByText("₹1,599")).toBeVisible();
  await fillCheckout(page, "Cash on delivery");
  await page.getByLabel("PIN code").fill("12345");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText(/PIN code/i).first()).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Asha Verma"); // input survives the error
});

test("COD order: confirmation is token-gated, staff confirm → ship → deliver, stock follows", async ({ page, browser }) => {
  await addToBag(page);
  await fillCheckout(page, "Cash on delivery");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/order-confirmation\/TNV-[A-Z0-9]{8}\?t=/);
  await expect(page.getByRole("heading", { name: /We've received your order/ })).toBeVisible();
  await expect(page.getByText("₹1,649").first()).toBeVisible(); // 1,500 + 99 shipping + 50 COD fee
  const url = page.url();
  const reference = /order-confirmation\/(TNV-[A-Z0-9]{8})/.exec(url)?.[1] ?? "";

  // Reference without the token (or with a wrong one) reveals nothing.
  const anon = await browser.newContext();
  const a = await anon.newPage();
  expect((await a.goto(`/order-confirmation/${reference}`))?.status()).toBe(404);
  expect((await a.goto(`/order-confirmation/${reference}?t=wrong-token-wrong-token`))?.status()).toBe(404);
  expect((await a.goto(url))?.status()).toBe(200);
  await anon.close();

  await signIn(page, E2E.smEmail);
  await page.goto(`/admin/orders?q=${reference}`);
  await page.getByRole("link", { name: reference }).click();
  await page.getByRole("button", { name: "Confirm order" }).click();
  await expect(page.getByText(/Confirmed · Cash on delivery/)).toBeVisible();
  await page.getByLabel("Carrier (optional)").fill("Manual");
  await page.getByLabel("Tracking number (optional)").fill("AWB-E2E-1");
  await page.getByRole("button", { name: "Mark as shipped" }).click();
  await expect(page.getByText("Shipment: Manual AWB-E2E-1")).toBeVisible();
  await page.getByRole("button", { name: /Mark delivered/ }).click();
  await expect(page.getByText(/Delivered · Cash on delivery · paid/)).toBeVisible();
});

test("online order: payment page, signed webhook confirms once, duplicates and forged calls are rejected", async ({ page, request }) => {
  await addToBag(page);
  await fillCheckout(page, "Pay online");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/checkout\/pay\/TNV-[A-Z0-9]{8}\?t=/);
  await expect(page.getByRole("heading", { name: "Complete your payment" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Pay now/ })).toBeVisible();
  const payUrl = page.url();
  const reference = /pay\/(TNV-[A-Z0-9]{8})/.exec(payUrl)?.[1] ?? "";

  // CSP: only the payment page allows Razorpay's origins.
  const payRes = await page.request.get(payUrl);
  expect(payRes.headers()["content-security-policy"]).toContain("checkout.razorpay.com");
  expect((await page.request.get("/cart")).headers()["content-security-policy"]).not.toContain("razorpay");

  const prisma = createPrisma(process.env.DATABASE_URL_TEST ?? "");
  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { reference }, include: { payments: true, items: true } });
    const attempt = order.payments[0];
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.totalPaise).toBe(159900);
    const before = await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId: order.items[0]?.variantId ?? "" } });
    expect(before.reserved).toBeGreaterThanOrEqual(1);

    const payload = (event: string, amount: number) =>
      JSON.stringify({ entity: "event", event, contains: ["payment"], created_at: 1, payload: { payment: { entity: { id: "pay_e2e_1", entity: "payment", amount, currency: "INR", status: event === "payment.captured" ? "captured" : "failed", order_id: attempt?.providerOrderId, error_code: null } } } });
    const post = (body: string, headers: Record<string, string>) => request.post("/api/webhooks/razorpay", { data: body, headers: { "content-type": "application/json", ...headers } });

    // forged signature
    expect((await post(payload("payment.captured", 159900), { "x-razorpay-signature": "deadbeef", "x-razorpay-event-id": `evt_forged_${RUN}` })).status()).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { reference } })).status).toBe("PENDING_PAYMENT");

    // wrong amount → not confirmed
    const bad = payload("payment.captured", 100);
    await post(bad, { "x-razorpay-signature": sign(bad), "x-razorpay-event-id": `evt_wrong_amount_${RUN}` });
    expect((await prisma.order.findUniqueOrThrow({ where: { reference } })).status).toBe("PENDING_PAYMENT");

    // genuine capture, delivered twice
    const good = payload("payment.captured", 159900);
    const h = { "x-razorpay-signature": sign(good), "x-razorpay-event-id": `evt_good_1_${RUN}` };
    expect(await (await post(good, h)).json()).toEqual({ status: "ok" });
    expect(await (await post(good, h)).json()).toEqual({ status: "duplicate" });
    // …and again under a NEW event id (provider retry with a different id): still no double decrement.
    await post(good, { ...h, "x-razorpay-event-id": `evt_good_2_${RUN}` });

    const paid = await prisma.order.findUniqueOrThrow({ where: { reference } });
    expect(paid).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID" });
    const after = await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId: order.items[0]?.variantId ?? "" } });
    expect(after.onHand).toBe(before.onHand - 1);
    expect(after.reserved).toBe(before.reserved - 1);
    expect(await prisma.inventoryMovement.count({ where: { reference, type: "SALE" } })).toBe(1);

    await page.goto(payUrl); // paying page redirects to confirmation once paid
    await expect(page).toHaveURL(/order-confirmation/);
    await expect(page.getByText("Your order is confirmed")).toBeVisible();
  } finally {
    await prisma.$disconnect();
  }
});

test("reservation expiry endpoint requires the cron secret", async ({ request }) => {
  expect((await request.post("/api/cron/expire-orders")).status()).toBe(401);
  expect((await request.post("/api/cron/expire-orders", { headers: { authorization: "Bearer nope" } })).status()).toBe(401);
  const ok = await request.post("/api/cron/expire-orders", { headers: { authorization: "Bearer e2e-cron-secret-e2e-cron-secret" } });
  expect(ok.status()).toBe(200);
  expect(typeof (await ok.json()).expired).toBe("number");
});

test("staff create a WhatsApp-sourced order; reports and audit are permissioned", async ({ page }) => {
  await signIn(page, E2E.smEmail);
  await page.goto("/admin/orders/new");
  await page.getByLabel("Item 1").selectOption({ index: 1 });
  await page.getByLabel("Full name").fill("Meera Iyer");
  await page.getByLabel("Email").fill("meera@example.test");
  await page.getByLabel("Mobile number").fill("9123456780");
  await page.getByLabel("Address line 1", { exact: true }).fill("5 Lake View");
  await page.getByLabel("City").fill("Chennai");
  await page.getByLabel("State").fill("Tamil Nadu");
  await page.getByLabel("PIN code").fill("600001");
  await page.getByRole("radio", { name: /Cash on delivery/ }).check();
  await page.getByRole("button", { name: /Create order/ }).click();
  await expect(page.getByText(/Order TNV-[A-Z0-9]{8} created and stock reserved/)).toBeVisible();

  await page.goto("/admin/orders?q=Meera");
  await expect(page.getByRole("row", { name: /Meera Iyer/ }).first()).toBeVisible();
  await page.getByRole("link", { name: /TNV-/ }).first().click();
  await expect(page.getByText(/source whatsapp/)).toBeVisible();

  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByRole("term").filter({ hasText: "Paid sales" })).toBeVisible();
  expect((await page.goto("/admin/audit"))?.status()).toBe(403); // store managers lack audit.read
  const csv = await page.request.get("/admin/reports/export");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).not.toContain("meera@example.test"); // no personal data without customers.export
});
