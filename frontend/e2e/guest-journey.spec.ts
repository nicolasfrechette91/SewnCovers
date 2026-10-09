import { expect, test, type Page, type Route } from "@playwright/test";

const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://api.sewncovers.test";
const basePath =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const configurePath = `${basePath}/configure/`;
const publicId = "AbCdEfGhIjKlMnOpQrStUv";
const projectId = "P".repeat(22);
const versionId = "V".repeat(22);
const sessionToken = "G".repeat(43);
const passphrase = "safe isolated fixture phrase";
const expiresAt = new Date(Date.now() + 3_600_000).toISOString();

// The catalogue must hold 12–20 patterns.
const patterns = [
  ["prototype-botanical", "Seed scatter", "botanical"],
  ["fern-trail", "Fern trail", "botanical"],
  ["meadow-sprig", "Meadow sprig", "botanical"],
  ["prototype-geometric", "Harlequin", "geometric"],
  ["diamond-path", "Diamond path", "geometric"],
  ["arch-grid", "Arch grid", "geometric"],
  ["harbor-stripe", "Harbour stripe", "striped"],
  ["orchard-stripe", "Orchard stripe", "striped"],
  ["ribbon-stripe", "Ribbon stripe", "striped"],
  ["prototype-woven", "Fine weave", "woven"],
  ["basket-check", "Basket check", "woven"],
  ["linen-crosshatch", "Linen crosshatch", "woven"],
].map(([id, name, categoryId]) => ({
  id,
  name,
  description: `Mocked ${name}.`,
  categoryId,
  colorIds: ["ivory"],
  previewClassName: `api-${id}`,
}));

// The design the helper below builds, as the API receives it.
const projectConfiguration = {
  shape: "box",
  width: 72.25,
  height: 48.5,
  thickness: 12.75,
  unit: "cm",
  patternScale: 1,
  backWidth: null,
  materialId: "linen-blend",
  fitPreference: "standard",
  closureType: "zipper",
  seamStyle: "plain",
  pattern: { kind: "built-in", patternId: "fern-trail" },
};

const sharedDesign = {
  shape: "box",
  width: 60,
  height: 40,
  backWidth: null,
  thickness: 10,
  unit: "cm",
  patternId: "meadow-sprig",
  solidColor: null,
  patternScale: 1.2,
  materialId: "cotton-canvas",
  fitPreference: "standard",
  closureType: "zipper",
  seamStyle: "plain",
  publicId,
};

const corsHeaders = {
  "access-control-allow-origin": appOrigin,
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "DELETE, GET, PATCH, POST, OPTIONS",
  "content-type": "application/json",
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    headers: corsHeaders,
    status,
  });
}

function projectDetail(configuration: unknown) {
  return {
    id: projectId,
    name: "Patio bench",
    versionCount: 1,
    updatedAt: "2026-09-30T10:00:00Z",
    privacy: "private",
    createdAt: "2026-09-30T10:00:00Z",
    activeShares: [],
    currentVersion: {
      id: versionId,
      versionNumber: 1,
      configuration,
      createdAt: "2026-09-30T10:00:00Z",
      isCurrent: true,
    },
  };
}

const quote = {
  demonstration: true,
  modelLabel: "Demonstration CAD price model v1",
  priceBookVersion: 1,
  currency: "CAD",
  quantity: 1,
  unitAmountMinor: 10450,
  subtotalAmountMinor: 10450,
  subtotalFormatted: "$104.50 CAD",
  breakdown: [],
  taxTreatment: "Fictional.",
  shippingTreatment: "Fictional.",
  id: "Q".repeat(22),
  status: "active",
  projectVersionId: versionId,
  configuration: {},
  createdAt: "2026-09-30T10:00:00Z",
  expiresAt: "2026-10-07T10:00:00Z",
  canCheckout: true,
  customAsset: null,
};

async function mockApi(page: Page) {
  const calls = {
    authenticated: [] as string[],
    designGets: 0,
    projectPosts: [] as unknown[],
    quotePosts: 0,
    cartLinePosts: 0,
    registrations: 0,
    unexpected: [] as string[],
  };
  let savedConfiguration: unknown = null;
  await page.route(
    /^https?:\/\/(?!127\.0\.0\.1:3100(?:\/|$)|api\.sewncovers\.test(?:\/|$)).*/,
    (route) => route.abort("blockedbyclient"),
  );
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === "OPTIONS")
      return route.fulfill({ headers: corsHeaders, status: 204 });
    if (request.headers().authorization)
      calls.authenticated.push(`${method} ${path}`);
    const account = {
      email: "guest@example.invalid",
      createdAt: "2026-09-30T09:00:00Z",
      role: "customer",
    };
    if (method === "GET" && path === "/patterns") return json(route, patterns);
    // As in production: custom uploads are off.
    if (method === "GET" && path === "/uploads/availability")
      return json(route, { enabled: false });
    if (method === "POST" && path === "/designs")
      return json(
        route,
        { ...sharedDesign, ...request.postDataJSON(), publicId },
        201,
      );
    if (method === "GET" && path === `/designs/${publicId}`) {
      calls.designGets += 1;
      return json(route, sharedDesign);
    }
    if (method === "POST" && path === "/auth/login")
      return json(route, { account, token: sessionToken, expiresAt });
    if (method === "POST" && path === "/auth/register") {
      calls.registrations += 1;
      return json(route, { account, token: sessionToken, expiresAt }, 201);
    }
    if (method === "POST" && path === "/account/acknowledgements")
      return json(
        route,
        {
          id: 1,
          documentType: "terms",
          documentVersion: 1,
          purpose: "account_terms",
          acknowledgedAt: "2026-09-30T09:00:01Z",
        },
        201,
      );
    if (method === "GET" && path === "/account") return json(route, account);
    if (method === "GET" && path === "/account/sessions")
      return json(route, [
        {
          id: 1,
          createdAt: "2026-09-30T09:00:00Z",
          expiresAt,
          revokedAt: null,
          current: true,
        },
      ]);
    if (method === "POST" && path === "/projects") {
      const body = request.postDataJSON();
      calls.projectPosts.push(body);
      savedConfiguration = body.configuration;
      return json(route, projectDetail(savedConfiguration), 201);
    }
    if (method === "GET" && path === `/projects/${projectId}`)
      return json(route, projectDetail(savedConfiguration));
    if (method === "GET" && path === "/commerce/cart") {
      const lines = calls.cartLinePosts
        ? [
            {
              id: "L".repeat(22),
              quote,
              quantity: 1,
              extendedAmountMinor: 10450,
            },
          ]
        : [];
      return json(route, {
        id: "K".repeat(22),
        demonstration: true,
        state: "active",
        currency: "CAD",
        lines,
        subtotalAmountMinor: 0,
        subtotalFormatted: "$0.00 CAD",
        notices: [],
      });
    }
    if (method === "POST" && path === "/commerce/quotes") {
      calls.quotePosts += 1;
      return json(route, quote, 201);
    }
    if (method === "POST" && path === "/commerce/cart/lines") {
      calls.cartLinePosts += 1;
      return json(route, {
        id: "K".repeat(22),
        demonstration: true,
        state: "active",
        currency: "CAD",
        lines: [
          {
            id: "L".repeat(22),
            quote,
            quantity: 1,
            extendedAmountMinor: 10450,
          },
        ],
        subtotalAmountMinor: 10450,
        subtotalFormatted: "$104.50 CAD",
        notices: [],
      });
    }
    calls.unexpected.push(`${method} ${path}`);
    return json(
      route,
      {
        errors: [
          {
            code: "resource_not_found",
            message: "Not found.",
            location: ["path"],
          },
        ],
      },
      404,
    );
  });
  return calls;
}

async function expectNoSignInPrompt(page: Page) {
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /sign in/i })).toHaveCount(0);
  await expect(main.getByRole("button", { name: /sign in/i })).toHaveCount(0);
}

// Builds a box cushion as a guest, checking at every stage that nothing asks
// for an account, and stops at the requested stage.
async function buildDesign(page: Page, stopAt: "pattern" | "review") {
  await page.getByText("Box / bench cushion", { exact: true }).click();
  await expectNoSignInPrompt(page);
  await page.getByRole("button", { name: "Continue to Measurements" }).click();
  await page.getByRole("textbox", { name: "Width (cm)" }).fill("72.25");
  await page.getByRole("textbox", { name: "Depth (cm)" }).fill("48.5");
  await page.getByRole("textbox", { name: "Thickness (cm)" }).fill("12.75");
  await expectNoSignInPrompt(page);
  await page.getByRole("button", { name: "Continue to Cover details" }).click();
  await page.getByRole("radio", { name: "Linen blend" }).check();
  await expectNoSignInPrompt(page);
  await page.getByRole("button", { name: "Continue to Pattern" }).click();
  await page.getByText("Fern trail", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Fern trail" })).toBeChecked();
  await expectNoSignInPrompt(page);
  if (stopAt === "pattern") return;
  await page.getByRole("button", { name: "Continue to Preview" }).click();
  await expect(
    page.getByRole("slider", { name: "Pattern size" }),
  ).toBeVisible();
  await expectNoSignInPrompt(page);
  await page.getByRole("button", { name: "Continue to Review" }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "SewnCovers configuration summary",
    }),
  ).toBeFocused();
}

test("a guest completes the whole configurator and shares it without a sign-in prompt", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await page.goto(configurePath);
  await buildDesign(page, "review");
  await expectNoSignInPrompt(page);
  await expect(
    page.getByText(/asked to sign in or create an account next/),
  ).toBeVisible();
  // A name is suggested, so saving never stops to ask for one first.
  await expect(page.getByLabel("Project name")).toHaveValue(
    "Box / bench cushion, Fern trail",
  );
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page).toHaveTitle(
    /^Review \(stage 6 of 6\) – Configure a cushion \| SewnCovers$/,
  );

  await page
    .getByRole("button", { name: "Save and create share link" })
    .click();
  await expect(page.getByRole("textbox", { name: "Share URL" })).toHaveValue(
    `${appOrigin}${configurePath}?design=${publicId}`,
  );
  expect(calls.authenticated).toEqual([]);
  expect(calls.unexpected).toEqual([]);
});

test("the design in progress survives a reload and can be started over", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(configurePath);
  await buildDesign(page, "pattern");

  await page.reload();
  await expect(
    page.getByText(
      "Picked up where you left off. This design is kept in this browser.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "Fern trail" })).toBeChecked();
  await expect(
    page.getByRole("status").filter({
      hasText: "Picked up where you left off. Stage 4 of 6: Pattern.",
    }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Back to Cover details" }).click();
  await expect(page.getByRole("radio", { name: "Linen blend" })).toBeChecked();
  await page.getByRole("button", { name: "Back to Measurements" }).click();
  await expect(page.getByRole("textbox", { name: "Width (cm)" })).toHaveValue(
    "72.25",
  );

  await page.getByRole("button", { name: "Start a new design" }).click();
  await page.getByRole("button", { name: "Clear and start again" }).click();
  await expect(
    page.getByRole("radio", { name: "Box / bench cushion" }),
  ).not.toBeChecked();
  await expect(page.locator("#configuration-shape-edit-target")).toBeFocused();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("sewncovers.configurator-draft"),
    ),
  ).toBeNull();
  await page.reload();
  await expect(
    page.getByRole("group", { name: "Choose your cushion shape" }),
  ).toBeVisible();
  await expect(page.getByText(/Picked up where you left off/)).toHaveCount(0);
});

test("the configurator still works when the browser blocks site storage", async ({
  page,
}) => {
  await page.addInitScript(() => {
    for (const name of ["localStorage", "sessionStorage"]) {
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          throw new DOMException("Site storage is blocked.", "SecurityError");
        },
      });
    }
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockApi(page);
  await page.goto(configurePath);
  await buildDesign(page, "review");
  await expect(
    page.getByRole("region", { name: "Save to My projects" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("group", { name: "Choose your cushion shape" }),
  ).toBeVisible();
  await expect(page.getByText(/Picked up where you left off/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("signing in at Save keeps the design, saves it once, and links the draft", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(configurePath);
  await buildDesign(page, "review");

  const panel = page.getByRole("region", { name: "Save to My projects" });
  await panel.getByLabel("Project name").fill("Patio bench");
  await panel.getByRole("button", { name: "Save to My projects" }).click();
  const signIn = page.getByRole("region", {
    name: "Sign in to save this design",
  });
  await expect(
    signIn.getByRole("heading", { name: "Sign in to save this design" }),
  ).toBeFocused();
  await expect(signIn).toContainText("Projects are kept in your account");
  await expect(
    signIn.getByRole("button", { name: "Create an account instead" }),
  ).toBeVisible();
  await expect(
    signIn.getByRole("button", { name: "Continue as guest" }),
  ).toBeVisible();
  await signIn.getByLabel("Email").fill("guest@example.invalid");
  await signIn.getByLabel("Passphrase").fill(passphrase);
  await signIn.getByRole("button", { name: "Sign in and save" }).click();

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Private project created with version 1." }),
  ).toBeFocused();
  expect(calls.projectPosts).toEqual([
    { name: "Patio bench", configuration: projectConfiguration },
  ]);
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Configuration details", exact: true }),
  ).toContainText("72.25 cm");

  // Reloading brings back the same stage and never saves the design again.
  await page.reload();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "SewnCovers configuration summary",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("This design matches version 1, the current version."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Save to My projects|Save as new version/,
    }),
  ).toHaveCount(0);
  expect(calls.projectPosts).toHaveLength(1);

  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Added to your demonstration cart as a fictional quote.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: "This design is already in your demonstration cart.",
    }),
  ).toBeVisible();
  expect([
    calls.projectPosts.length,
    calls.quotePosts,
    calls.cartLinePosts,
  ]).toEqual([1, 1, 1]);
});

test("creating an account inline at Add to cart resumes it exactly once", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await page.goto(configurePath);
  await buildDesign(page, "review");

  // No name typed: the suggested one goes through sign-in and is used.
  await page.getByRole("button", { name: "Save and add to cart" }).click();
  const signIn = page.getByRole("region", {
    name: /add this design to your cart|add it to your cart/,
  });
  await signIn
    .getByRole("button", { name: "Create an account instead" })
    .click();
  await expect(
    signIn.getByRole("heading", {
      name: "Create an account to add it to your cart",
    }),
  ).toBeFocused();
  await signIn.getByLabel("Email").fill("new-guest@example.invalid");
  await signIn.getByLabel("Passphrase").fill(passphrase);
  await signIn
    .getByRole("checkbox", { name: /account terms version 1/i })
    .check();
  await signIn
    .getByRole("button", { name: "Create account and add to cart" })
    .click();

  await expect(
    page.getByRole("status").filter({
      hasText:
        "Private project created with version 1. Added to your demonstration cart as a fictional quote.",
    }),
  ).toBeFocused();
  await expect(page.getByRole("link", { name: "View cart" })).toHaveAttribute(
    "href",
    `${basePath}/cart/`,
  );
  expect([
    calls.registrations,
    calls.projectPosts.length,
    calls.quotePosts,
    calls.cartLinePosts,
  ]).toEqual([1, 1, 1, 1]);
  expect(calls.projectPosts).toEqual([
    {
      name: "Box / bench cushion, Fern trail",
      configuration: projectConfiguration,
    },
  ]);
});

test("signing in from the header returns to the same stage with the design intact", async ({
  page,
}) => {
  await mockApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(configurePath);
  await buildDesign(page, "pattern");

  const headerSignIn = page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Sign in" });
  await expect(headerSignIn).toHaveAttribute(
    "href",
    `${basePath}/account/?mode=login&returnTo=configure`,
  );
  await headerSignIn.click();
  await expect(
    page.getByText(/you will return to the configurator/),
  ).toBeVisible();
  await page.locator("#login-email").fill("guest@example.invalid");
  await page.locator("#login-password").fill(passphrase);
  await page.locator("#login-password").press("Enter");

  await expect(page).toHaveURL(`${appOrigin}${configurePath}`);
  await expect(page.getByRole("radio", { name: "Fern trail" })).toBeChecked();
  await expect(
    page.locator("#configuration-pattern-edit-target"),
  ).toBeFocused();
  await expect(
    page.getByRole("status").filter({
      hasText:
        "Signed in. Your design is as you left it. Stage 4 of 6: Pattern.",
    }),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Account" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to Cover details" }).click();
  await page.getByRole("button", { name: "Back to Measurements" }).click();
  await expect(page.getByRole("textbox", { name: "Width (cm)" })).toHaveValue(
    "72.25",
  );
});

test("opening a shared link never silently replaces an unsaved design", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await page.goto(configurePath);
  await buildDesign(page, "pattern");

  await page.goto(`${configurePath}?design=${publicId}`);
  const heading = page.getByRole("heading", {
    name: "Keep your unsaved design?",
  });
  await expect(heading).toBeFocused();
  await expect(page.getByText(/This link opens a shared design/)).toBeVisible();
  expect(calls.designGets).toBe(0);
  await page.getByRole("button", { name: "Keep my design" }).click();
  await expect(page).toHaveURL(`${appOrigin}${configurePath}`);
  await expect(page.getByRole("radio", { name: "Fern trail" })).toBeChecked();
  expect(calls.designGets).toBe(0);

  await page.goto(`${configurePath}?design=${publicId}`);
  await page.getByRole("button", { name: "Open the link instead" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Shared design restored." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to Measurements" }).click();
  await expect(page.getByRole("textbox", { name: "Width (cm)" })).toHaveValue(
    "60",
  );

  // An untouched copy of the same link opens straight away.
  await page.goto(`${configurePath}?design=${publicId}`);
  await expect(
    page.getByRole("status").filter({ hasText: "Shared design restored." }),
  ).toBeVisible();
  await expect(heading).toHaveCount(0);
});
