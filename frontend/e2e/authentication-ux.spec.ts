import { expect, test, type Page, type Route } from "@playwright/test";

const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://api.sewncovers.test";
const basePath = process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const accountPath = `${basePath}/account/`;
const sessionToken = "U".repeat(43);
const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
const passphrase = "safe isolated fixture phrase";

const corsHeaders = {
  "access-control-allow-origin": appOrigin,
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "DELETE, GET, PATCH, POST, OPTIONS",
  "content-type": "application/json",
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), headers: corsHeaders, status });
}

async function blockUnrelatedNetwork(page: Page) {
  await page.route(
    /^https?:\/\/(?!127\.0\.0\.1:3100(?:\/|$)|api\.sewncovers\.test(?:\/|$)).*/,
    (route) => route.abort("blockedbyclient"),
  );
}

async function installAuthApi(page: Page, onLogin?: () => void) {
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
      return;
    }
    if (path === "/auth/login") {
      onLogin?.();
      const credentials = request.postDataJSON() as { email?: string };
      if (credentials.email === "unavailable@example.invalid") {
        await route.abort("failed");
        return;
      }
      if (credentials.email === "invalid@example.invalid") {
        await json(route, {
          errors: [{
            code: "authentication_failed",
            message: "Email or password could not be accepted.",
            location: ["body", "credentials"],
          }],
        }, 401);
        return;
      }
      if (credentials.email === "server@example.invalid") {
        await json(route, {
          errors: [{
            code: "internal_error",
            message: "An unexpected error occurred.",
            location: ["service"],
          }],
        }, 500);
        return;
      }
      if (credentials.email === "slow@example.invalid") {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      await json(route, {
        account: {
          email: credentials.email ?? "fixture@example.invalid",
          createdAt: "2026-09-08T00:00:00Z",
          role: "customer",
        },
        token: sessionToken,
        expiresAt,
      });
      return;
    }
    if (path === "/auth/register") {
      const credentials = request.postDataJSON() as { email?: string };
      if (credentials.email === "existing@example.invalid") {
        await json(route, {
          errors: [{
            code: "authentication_failed",
            message: "Email or password could not be accepted.",
            location: ["body", "credentials"],
          }],
        }, 401);
        return;
      }
      await json(route, {
        account: {
          email: credentials.email ?? "new-fixture@example.invalid",
          createdAt: "2026-09-08T00:00:00Z",
          role: "customer",
        },
        token: sessionToken,
        expiresAt,
      }, 201);
      return;
    }
    if (path === "/account/acknowledgements") {
      await json(route, {
        id: 1,
        documentType: "terms",
        documentVersion: 1,
        purpose: "account_terms",
        acknowledgedAt: "2026-09-08T00:00:01Z",
      }, 201);
      return;
    }
    if (path === "/account") {
      await json(route, {
        email: "fixture@example.invalid",
        createdAt: "2026-09-08T00:00:00Z",
        role: "customer",
      });
      return;
    }
    if (path === "/account/sessions") {
      await json(route, [{
        id: 1,
        createdAt: "2026-09-08T00:00:00Z",
        expiresAt,
        revokedAt: null,
        current: true,
      }]);
      return;
    }
    if (path === "/projects" || path === "/commerce/orders" || path === "/commerce/quotes") {
      await json(route, []);
      return;
    }
    if (path === "/commerce/cart") {
      await json(route, {
        id: "K".repeat(22), demonstration: true, state: "active", currency: "CAD",
        lines: [], subtotalAmountMinor: 0, subtotalFormatted: "$0.00 CAD", notices: [],
      });
      return;
    }
    if (path === "/patterns") {
      await json(route, []);
      return;
    }
    await json(route, { errors: [{ code: "resource_not_found", message: "Not found.", location: ["path"] }] }, 404);
  });
}

async function completeSignIn(page: Page, email = "fixture@example.invalid") {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("authentication modes remain distinct, reversible, and field-accessible", async ({ page }) => {
  await blockUnrelatedNetwork(page);
  await installAuthApi(page);
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto(accountPath);

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator("form")).toHaveCount(1);
  await expect(page.locator("#register-password")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByLabel("Passphrase")).toHaveAttribute("autocomplete", "current-password");
  await page.getByLabel("Passphrase").fill(passphrase);

  await page.getByRole("link", { name: "Create account" }).press("Enter");
  await expect(page).toHaveURL(`${accountPath}?mode=register`);
  await expect(page.getByRole("heading", { name: "Create account" })).toBeFocused();
  await expect(page.locator("form")).toHaveCount(1);
  await expect(page.locator("#login-password")).toHaveCount(0);
  await expect(page.getByLabel("Passphrase")).toHaveValue("");
  await expect(page.getByLabel("Passphrase")).toHaveAttribute("autocomplete", "new-password");
  await expect(page.getByRole("checkbox", { name: /account terms version 1/i })).not.toBeChecked();
  await expect(page.getByText("Use 12–128 characters. There is no composition rule.")).toBeVisible();

  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("checkbox", { name: /account terms version 1/i }).check();
  await page.getByRole("link", { name: "Sign in" }).press("Enter");
  await expect(page).toHaveURL(`${accountPath}?mode=login`);
  await expect(page.getByLabel("Passphrase")).toHaveValue("");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await expect(page.getByLabel("Passphrase")).toHaveValue("");
  await expect(page.getByRole("checkbox", { name: /account terms version 1/i })).not.toBeChecked();

  await page.goto(`${accountPath}?mode=unsupported`);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();
  const email = page.getByLabel("Email");
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAttribute("aria-describedby", "login-email-error");
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await email.fill("invalid-address");
  await page.getByLabel("Passphrase").fill("short");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Passphrase must be 12–128 characters.")).toBeVisible();
});

test("authentication failures, registration, and duplicate submission recover safely", async ({ page }) => {
  await blockUnrelatedNetwork(page);
  let loginRequests = 0;
  await installAuthApi(page, () => { loginRequests += 1; });
  await page.goto(accountPath);

  await completeSignIn(page, "invalid@example.invalid");
  const credentialAlert = page.getByRole("alert").filter({ hasText: "Email or password could not be accepted." });
  await expect(credentialAlert).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("invalid@example.invalid");
  await expect(credentialAlert.locator("..")).toBeFocused();

  await completeSignIn(page, "unavailable@example.invalid");
  await expect(page.getByRole("alert").filter({ hasText: "The service could not be reached. Try again." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();

  await completeSignIn(page, "server@example.invalid");
  await expect(page.getByRole("alert").filter({ hasText: "An unexpected error occurred." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();

  await page.getByRole("link", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await page.getByLabel("Email").fill("existing@example.invalid");
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("checkbox", { name: /account terms version 1/i }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Email or password could not be accepted." })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("existing@example.invalid");

  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const beforeSlowRequest = loginRequests;
  await page.getByLabel("Email").fill("slow@example.invalid");
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Sign in" }).click({ noWaitAfter: true });
  await expect(page.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  await page.locator("#login-password").press("Enter");
  await expect(page.getByRole("heading", { name: "slow@example.invalid" })).toBeVisible();
  expect(loginRequests - beforeSlowRequest).toBe(1);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("link", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await page.locator("#register-email").fill("new-fixture@example.invalid");
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("checkbox", { name: /account terms version 1/i }).check();
  await page.getByLabel("Passphrase").press("Enter");
  await expect(page.getByRole("heading", { name: "new-fixture@example.invalid" })).toBeVisible();
  await expect(page.locator("#register-password")).toHaveCount(0);
});

test("session verification announces progress before restoring a verified account", async ({ page }) => {
  await blockUnrelatedNetwork(page);
  await page.addInitScript((token) => sessionStorage.setItem("sewncovers.session-token", token), sessionToken);
  await page.route(`${apiOrigin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
      return;
    }
    if (path === "/account" || path === "/account/sessions") {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (path === "/account") {
      await json(route, { email: "fixture@example.invalid", createdAt: "2026-09-08T00:00:00Z", role: "customer" });
      return;
    }
    if (path === "/account/sessions") {
      await json(route, [{ id: 1, createdAt: "2026-09-08T00:00:00Z", expiresAt, revokedAt: null, current: true }]);
      return;
    }
    await json(route, { errors: [] }, 404);
  });
  await page.goto(accountPath);
  await expect(page.getByRole("status").filter({ hasText: "Restoring your session…" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "fixture@example.invalid" })).toBeVisible();
});

test("safe return identifiers restore known destinations and reject redirect attempts", async ({ page }) => {
  await blockUnrelatedNetwork(page);
  await installAuthApi(page);
  const valid = [
    ["projects", `${basePath}/projects/`],
    ["cart", `${basePath}/cart/`],
    ["orders", `${basePath}/orders/`],
  ] as const;

  for (const [target, expected] of valid) {
    await page.goto(`${accountPath}?mode=login&returnTo=${target}`);
    await expect(page.getByText(new RegExp(`return to`))).toBeVisible();
    await completeSignIn(page);
    await expect(page).toHaveURL(`${appOrigin}${expected}`);
    await page.evaluate(() => sessionStorage.clear());
  }

  for (const value of [
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "%2F%2Fattacker.example%2Fsteal",
    "/projects/",
    "../projects",
    "admin",
    "%E0%A4%A",
  ]) {
    await page.goto(`${accountPath}?mode=login&returnTo=${value}`);
    await completeSignIn(page);
    await expect(page.getByRole("heading", { name: "fixture@example.invalid" })).toBeVisible();
    expect(new URL(page.url()).origin).toBe(appOrigin);
    expect(new URL(page.url()).pathname).toBe(accountPath);
    await page.evaluate(() => sessionStorage.clear());
  }
});

test("locked routes stay private, offer guest configuration, and fit required widths", async ({ page }) => {
  await blockUnrelatedNetwork(page);
  let protectedRequests = 0;
  await page.route(`${apiOrigin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path !== "/patterns") protectedRequests += 1;
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
    } else {
      await json(route, path === "/patterns" ? [] : { errors: [] }, path === "/patterns" ? 200 : 401);
    }
  });

  const locked = [
    ["projects", "Sign in to view private projects", "projects"],
    ["commerce", "Sign in to create an owned demonstration quote", "pricing"],
    ["cart", "Sign in to view your demonstration cart", "cart"],
    ["orders", "Sign in to view demonstration orders", "orders"],
    ["checkout/return/?order=O", "Sign in to check your demonstration order", "orders"],
  ] as const;
  for (const [path, heading, returnTo] of locked) {
    await page.goto(`${basePath}/${path}${path.includes("?") ? "" : "/"}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", new RegExp(`returnTo=${returnTo}$`));
    await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
    await expect(page.getByRole("link", { name: /guest design|configurator|configuring as a guest|start configuring/i }).first()).toBeVisible();
  }
  expect(protectedRequests).toBe(0);

  await page.goto(`${basePath}/configure/`);
  await expect(page.getByRole("heading", { name: "Build your custom cover design." })).toBeVisible();

  for (const width of [320, 375, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(accountPath);
    await expect(page.locator("form")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});
