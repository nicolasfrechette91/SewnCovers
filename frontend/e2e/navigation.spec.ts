import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://api.sewncovers.test";
const basePath = process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const customerToken = "C".repeat(43);
const adminToken = "A".repeat(43);
const expiresAt = "2099-08-30T00:00:00Z";

const corsHeaders = {
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-origin": appOrigin,
  "content-type": "application/json",
};

async function json(route: Route, value: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(value),
    headers: corsHeaders,
    status,
  });
}

async function mockAccount(context: BrowserContext) {
  await context.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const authorization = request.headers().authorization ?? "";
    const role = authorization.endsWith(adminToken)
      ? "administrator"
      : "customer";
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      return route.fulfill({ headers: corsHeaders, status: 204 });
    }
    if (path === "/account") {
      return json(route, {
        email: `${role}@example.invalid`,
        createdAt: "2026-08-30T00:00:00Z",
        role,
      });
    }
    if (path === "/account/sessions") {
      return json(route, [
        {
          id: 1,
          createdAt: "2026-08-30T00:00:00Z",
          expiresAt,
          revokedAt: null,
          current: true,
        },
      ]);
    }
    if (path === "/commerce/orders") return json(route, []);
    return json(route, { errors: [] }, 404);
  });
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test("organizes desktop navigation and preserves secondary destinations", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${basePath}/configure/`);
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(
    navigation.getByRole("list", { name: "Primary destinations" }).getByRole("link"),
  ).toHaveText(["Configure", "My projects", "Pricing"]);
  await expect(
    navigation.getByRole("list", { name: "Shopping and account" }).getByRole("link"),
  ).toHaveText(["Cart", "Account"]);
  for (const removed of ["Orders", "Admin", "Legal"]) {
    await expect(navigation.getByRole("link", { name: removed })).toHaveCount(0);
  }
  await expect(navigation.getByRole("link", { name: "Configure" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.getByRole("link", { name: "SewnCovers home" })).toHaveAttribute(
    "href",
    `${basePath}/`,
  );

  const footer = page.getByRole("navigation", { name: "Footer navigation" });
  await expect(footer.getByRole("link", { name: "Legal and privacy" })).toBeVisible();

  await footer.getByRole("link", { name: "Legal and privacy" }).click();
  await expect(page).toHaveURL(`${appOrigin}${basePath}/legal/`);
  await expect(
    page.getByRole("navigation", { name: "Footer navigation" }).getByRole("link", {
      name: "Legal and privacy",
    }),
  ).toHaveAttribute("aria-current", "page");
});

test("uses an accessible closed-by-default mobile disclosure", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${basePath}/`);
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  const menu = navigation.getByRole("button", { name: "Menu" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toHaveAttribute("aria-controls", "site-navigation-menu");
  await expect(navigation.getByRole("link", { name: "Configure" })).toBeHidden();
  await expectNoOverflow(page);
  expect(
    await page.locator("body > header").evaluate((header) => header.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(80);

  await menu.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(navigation.getByRole("link", { name: "Configure" })).toBeVisible();
  await menu.press("Tab");
  await expect(navigation.getByRole("link", { name: "Configure" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();

  await menu.click();
  await navigation.getByRole("link", { name: "Account" }).click();
  await expect(page).toHaveURL(`${appOrigin}${basePath}/account/`);
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});

test("keeps the header compact and overflow-free at required widths", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${basePath}/`);
    await expectNoOverflow(page);
    expect(
      await page.locator("body > header").evaluate((header) => header.getBoundingClientRect().height),
    ).toBeLessThanOrEqual(80);
  }
});

test("relocates Orders and authorizes Administration navigation from account context", async ({ browser }) => {
  const customer = await browser.newContext();
  await customer.addInitScript((token) => sessionStorage.setItem("sewncovers.session-token", token), customerToken);
  await mockAccount(customer);
  const customerPage = await customer.newPage();
  await customerPage.goto(`${basePath}/account/`);
  const customerAccount = customerPage.getByRole("navigation", { name: "Account navigation" });
  await expect(customerAccount.getByRole("link", { name: "Orders" })).toBeVisible();
  await expect(customerAccount.getByRole("link", { name: "Administration" })).toHaveCount(0);
  await expect(
    customerPage.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", {
      name: "Admin",
    }),
  ).toHaveCount(0);
  await customerAccount.getByRole("link", { name: "Orders" }).click();
  await expect(customerPage).toHaveURL(`${appOrigin}${basePath}/orders/`);
  await expect(customerPage.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
  await expect(
    customerPage.getByRole("navigation", { name: "Account navigation" }).getByRole("link", {
      name: "Orders",
    }),
  ).toHaveAttribute("aria-current", "page");
  await customer.close();

  const administrator = await browser.newContext();
  await administrator.addInitScript((token) => sessionStorage.setItem("sewncovers.session-token", token), adminToken);
  await mockAccount(administrator);
  const adminPage = await administrator.newPage();
  await adminPage.goto(`${basePath}/account/`);
  await expect(
    adminPage.getByRole("navigation", { name: "Account navigation" }).getByRole("link", {
      name: "Administration",
    }),
  ).toBeVisible();
  await administrator.close();
});

test("preserves every public route for direct navigation", async ({ page }) => {
  for (const route of [
    "",
    "configure/",
    "projects/",
    "commerce/",
    "cart/",
    "case-study/",
    "orders/",
    "account/",
    "admin/",
    "legal/",
  ]) {
    const response = await page.goto(`${basePath}/${route}`);
    expect(response?.status()).toBe(200);
  }
});
