import { expect, test, type Page, type Route } from "@playwright/test";

// Every API call is answered here; nothing reaches a real service.
const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://api.sewncovers.test";
const basePath =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const sessionToken = "S".repeat(43);
// A throwaway fixture value for the mocked API.
const passphrase = "correct horse battery staple";
const account = {
  createdAt: "2026-10-01T09:00:00Z",
  email: "new.visitor@example.invalid",
  role: "customer",
};
const expiresAt = "2099-01-01T00:00:00Z";
const corsHeaders = {
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "DELETE, GET, PATCH, POST, PUT, OPTIONS",
  "access-control-allow-origin": appOrigin,
  "content-type": "application/json",
};

interface Mock {
  readonly calls: string[];
  readonly urls: string[];
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    headers: corsHeaders,
    status,
  });
}

async function mockApi(
  page: Page,
  { registerStatus = 201 }: { registerStatus?: number } = {},
): Promise<Mock> {
  const mock: Mock = { calls: [], urls: [] };
  await page.route(
    /^https?:\/\/(?!127\.0\.0\.1:3100(?:\/|$)|api\.sewncovers\.test(?:\/|$)).*/,
    (route) => route.abort("blockedbyclient"),
  );
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
      return;
    }
    mock.calls.push(`${request.method()} ${path}`);
    mock.urls.push(request.url());

    if (request.method() === "POST" && path === "/auth/register") {
      if (registerStatus === 404) {
        await json(
          route,
          {
            errors: [
              {
                code: "resource_not_found",
                message: "Resource not found.",
                location: ["path"],
              },
            ],
          },
          404,
        );
        return;
      }
      await json(route, { account, expiresAt, token: sessionToken }, 201);
    } else if (
      request.method() === "POST" &&
      path === "/account/acknowledgements"
    ) {
      await json(
        route,
        {
          acknowledgedAt: "2026-10-01T09:00:01Z",
          documentType: "terms",
          documentVersion: 1,
          id: 1,
          purpose: "account_terms",
        },
        201,
      );
    } else if (path === "/account") {
      await json(route, account);
    } else if (path === "/account/sessions") {
      await json(route, [
        {
          createdAt: account.createdAt,
          current: true,
          expiresAt,
          id: 1,
          revokedAt: null,
        },
      ]);
    } else if (path === "/uploads/availability") {
      // These journeys need the upload option, so uploads are on here.
      await json(route, { enabled: true });
    } else if (path === "/uploads") {
      await json(route, []);
    } else if (path === "/patterns") {
      await json(route, []);
    } else {
      await json(
        route,
        {
          errors: [
            {
              code: "resource_not_found",
              message: "Resource not found.",
              location: ["path"],
            },
          ],
        },
        404,
      );
    }
  });
  return mock;
}

const count = (mock: Mock, call: string) =>
  mock.calls.filter((entry) => entry === call).length;

async function reachPatternStep(page: Page) {
  await page.goto(`${basePath}/configure/`);
  await page.getByText("Box / bench cushion", { exact: true }).click();
  await page.getByRole("button", { name: "Continue to Measurements" }).click();
  await page.getByRole("textbox", { name: "Width (cm)" }).fill("72.25");
  await page.getByRole("textbox", { name: "Depth (cm)" }).fill("48.5");
  await page.getByRole("textbox", { name: "Thickness (cm)" }).fill("12.75");
  await page.getByRole("button", { name: "Continue to Cover details" }).click();
  await page.getByRole("button", { name: "Continue to Pattern" }).click();
  await page.getByRole("button", { name: "Upload your own pattern" }).click();
}

test("creating an account on /account POSTs /auth/register once, then records the terms", async ({
  page,
}) => {
  const mock = await mockApi(page);

  await page.goto(`${basePath}/account/?mode=register`);
  await page.locator("#register-email").fill(account.email);
  await page.locator("#register-password").fill(passphrase);
  await page
    .getByRole("checkbox", { name: /account terms version 1/i })
    .check();
  await page.locator("#register-password").press("Enter");

  await expect(page.getByText(account.email)).toBeVisible();
  expect(count(mock, "POST /auth/register")).toBe(1);
  expect(count(mock, "POST /account/acknowledgements")).toBe(1);
  expect(
    mock.calls.filter((entry) => entry.startsWith("POST /auth/")).length,
  ).toBe(1);
  for (const url of mock.urls) {
    expect(new URL(url).origin).toBe(apiOrigin);
  }
});

test("creating an account inline at the Pattern step uses the same requests and resumes once", async ({
  page,
}) => {
  const mock = await mockApi(page);
  await reachPatternStep(page);

  const region = page.getByRole("region", {
    name: "Sign in to upload your own pattern",
  });
  await region
    .getByRole("button", { name: "Create an account instead" })
    .click();
  const create = page.getByRole("region", {
    name: "Create an account to upload your own pattern",
  });
  await expect(
    create.getByRole("heading", {
      name: "Create an account to upload your own pattern",
    }),
  ).toBeFocused();
  await create.getByLabel("Email").fill(account.email);
  await create.getByLabel("Passphrase").fill(passphrase);
  await create
    .getByRole("checkbox", { name: /account terms version 1/i })
    .check();
  await create.getByRole("button", { name: "Create account" }).click();

  // The action resumes: the sign-in step closes and the upload area opens once.
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Signed in. You can upload your own pattern below." }),
  ).toHaveCount(1);
  await expect(create).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: /upload notice version 1/i }),
  ).toBeVisible();
  await page.waitForTimeout(500);

  expect(count(mock, "POST /auth/register")).toBe(1);
  expect(count(mock, "POST /account/acknowledgements")).toBe(1);
  expect(count(mock, "GET /uploads")).toBe(1);
  expect(mock.calls.some((entry) => entry.startsWith("POST /uploads"))).toBe(
    false,
  );
  for (const url of mock.urls) {
    expect(new URL(url).origin).toBe(apiOrigin);
    expect(new URL(url).hostname).not.toBe("nicolasfrechette91.github.io");
  }
  // The design on screen was never touched.
  await expect(
    page.getByRole("heading", { exact: true, name: "Patterns" }),
  ).toBeVisible();
});

test("a missing register route reads clearly, is announced, and keeps the design", async ({
  page,
}) => {
  const mock = await mockApi(page, { registerStatus: 404 });
  await reachPatternStep(page);

  await page.getByRole("button", { name: "Create an account instead" }).click();
  const create = page.getByRole("region", {
    name: "Create an account to upload your own pattern",
  });
  await create.getByLabel("Email").fill(account.email);
  await create.getByLabel("Passphrase").fill(passphrase);
  await create
    .getByRole("checkbox", { name: /account terms version 1/i })
    .check();
  await create.getByRole("button", { name: "Create account" }).click();

  const alert = create.getByRole("alert");
  await expect(alert).toContainText(
    "Accounts aren't available on the SewnCovers service right now",
  );
  await expect(alert).not.toContainText("Resource not found");
  await expect(
    create
      .locator("div[tabindex='-1']")
      .filter({ has: page.getByRole("alert") }),
  ).toBeFocused();
  expect(count(mock, "POST /auth/register")).toBe(1);
  expect(count(mock, "POST /account/acknowledgements")).toBe(0);

  await create
    .getByRole("button", { name: "Continue with our patterns" })
    .click();
  await expect(
    page.getByRole("heading", { exact: true, name: "Patterns" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload your own pattern" }),
  ).toBeFocused();
});

test("offers no upload until availability answers enabled, and none if it fails", async ({
  page,
}) => {
  await mockApi(page);
  // Registered after the general mock, so it answers this path first.
  let releaseAnswer!: () => void;
  const answerGate = new Promise<void>((resolve) => {
    releaseAnswer = resolve;
  });
  let availabilityRequests = 0;
  await page.route(`${apiOrigin}/uploads/availability`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
      return;
    }
    availabilityRequests += 1;
    await answerGate;
    await json(
      route,
      {
        errors: [
          {
            code: "service_unavailable",
            message: "Unavailable.",
            location: ["service"],
          },
        ],
      },
      503,
    );
  });
  const nothingOffered = async () => {
    await expect(
      page.getByRole("heading", { exact: true, name: "Patterns" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Upload your own pattern" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /upload your own pattern/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Your patterns" }),
    ).toHaveCount(0);
    await expect(page.getByText(/Custom uploads aren't enabled/)).toHaveCount(
      0,
    );
  };

  await page.goto(`${basePath}/configure/`);
  await page.getByText("Box / bench cushion", { exact: true }).click();
  await page.getByRole("button", { name: "Continue to Measurements" }).click();
  await page.getByRole("textbox", { name: "Width (cm)" }).fill("72.25");
  await page.getByRole("textbox", { name: "Depth (cm)" }).fill("48.5");
  await page.getByRole("textbox", { name: "Thickness (cm)" }).fill("12.75");
  await page.getByRole("button", { name: "Continue to Cover details" }).click();
  await page.getByRole("button", { name: "Continue to Pattern" }).click();

  // Pending: the question is out, nothing is offered.
  await expect.poll(() => availabilityRequests).toBeGreaterThanOrEqual(1);
  await nothingOffered();

  // Failed, after the client's retries: still nothing.
  releaseAnswer();
  await expect.poll(() => availabilityRequests, { timeout: 10_000 }).toBe(3);
  await page.waitForTimeout(300);
  await nothingOffered();
});
