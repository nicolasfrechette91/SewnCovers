import { expect, test, type Page, type Route } from "@playwright/test";

import {
  api,
  base,
  corsHeaders,
  enableUploads,
  fixtures,
  id,
  orderId,
  routes,
} from "./support/api-fixtures";
import { auditDocument } from "./support/document-audit";
import { chooseRadio } from "./support/keyboard";

// Structural checks on every route and every configurator stage, run in a real
// browser against the exported site: one h1 and no skipped heading levels,
// data values that are not headings, navigation landmarks that hold links, a
// name that starts with the visible label, and no names on generic elements.
// The rules live in support/document-audit.ts, which tests/document-audit
// .test.tsx proves against deliberately broken markup.

const publicId = "AbCdEfGhIjKlMnOpQrStUv";

async function expectStructure(page: Page, where: string) {
  const findings = await page.evaluate(auditDocument);
  expect(findings, where).toEqual([]);
}

/** Saving a public design succeeds, so the share panel can be audited too. */
async function allowPublicSave(page: Page) {
  await page.route(`${api}/designs`, async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        ...(route.request().postDataJSON() as Record<string, unknown>),
        publicId,
      }),
      headers: corsHeaders,
      status: 201,
    });
  });
}

for (const role of ["guest", "customer", "administrator"] as const) {
  test(`every route has a sound outline, landmarks and names: ${role}`, async ({ page }) => {
    test.setTimeout(120_000);
    await fixtures(page, role);

    for (const route of [...routes(), "/404.html"]) {
      await page.goto(`${base}${route}`);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await page.waitForLoadState("networkidle");
      await expectStructure(page, `${role} ${route}`);
    }
  });
}

test("detail and operational states keep the outline sound", async ({ page }) => {
  test.setTimeout(120_000);
  await fixtures(page, "administrator");

  const states: readonly (readonly [string, string])[] = [
    ["project", `/projects/?project=${id}`],
    ["order", `/orders/?order=${orderId}`],
    ["checkout return", `/checkout/return/?order=${orderId}`],
    ["sandbox checkout", `/checkout/sandbox/?session=sc_demo_attempt_browser_00001&order=${orderId}`],
    ["pricing and quotes", "/commerce/"],
    ["cart", "/cart/"],
    ["admin", "/admin/"],
  ];
  for (const [name, route] of states) {
    await page.goto(`${base}${route}`);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await page.waitForLoadState("networkidle");
    if (name === "pricing and quotes") {
      await page.getByRole("button", { name: "Preview price" }).click();
      await expect(page.getByRole("region", { name: /Estimated subtotal/ })).toBeVisible();
    }
    if (name === "admin") {
      await page.getByRole("button", { name: "Review specification" }).click();
      await page.getByRole("button", { name: /SC-DEMO-WORK0001/ }).click();
      await page.getByRole("button", { name: "Review publication" }).click();
      await page.getByRole("button", { name: "Run readiness checks" }).click();
      await expect(page.getByText("Production contact remains a placeholder.")).toBeVisible();
    }
    await expectStructure(page, name);
  }
});

test("every configurator stage, and the panels that open on it, keep the outline sound", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await fixtures(page, "guest");
  await allowPublicSave(page);
  await enableUploads(page);

  // The first stage keeps the page introduction as its h1.
  await page.goto(`${base}/configure/`);
  await expect(page.getByRole("heading", { level: 2, name: "Choose your cushion shape" })).toBeVisible();
  await expectStructure(page, "shape stage");

  await page.goto(`${base}/configure/?design=${publicId}`);
  await expect(page.getByText("Shared design restored.")).toBeVisible();
  await expectStructure(page, "shape stage, shared design restored");

  // A shape that needs equal sides asks before changing the measurements.
  await page.getByText("Square cushion", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Use the same width and height?" })).toBeVisible();
  await expectStructure(page, "shape change question");
  await page.keyboard.press("Escape");
  await page.getByText("Rectangle cushion", { exact: true }).click();

  await page.getByRole("button", { name: "Continue to Measurements" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Measure your/ })).toBeVisible();
  await expectStructure(page, "measurements stage");
  await page.getByRole("textbox", { name: /^Width/ }).fill("1");
  await page.getByRole("textbox", { name: /^Width/ }).blur();
  await expect(page.getByRole("status").filter({ hasText: "must be" })).toBeVisible();
  await expectStructure(page, "measurements stage with an error");
  await page.getByRole("textbox", { name: /^Width/ }).fill("73.25");

  await page.getByRole("button", { name: "Continue to Cover details" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Choose cover details" })).toBeVisible();
  await expectStructure(page, "cover details stage");

  await page.getByRole("button", { name: "Continue to Pattern" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Choose a colour or pattern" })).toBeVisible();
  await expectStructure(page, "pattern stage");
  await chooseRadio(page, "Solid colour");
  await expect(page.getByRole("heading", { name: "Pick your colour" })).toBeVisible();
  await expectStructure(page, "pattern stage, solid colour");
  await page.getByRole("button", { name: "Upload your own pattern" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to upload your own pattern" })).toBeVisible();
  await expectStructure(page, "pattern stage, upload sign-in");
  await page.getByRole("button", { name: "Continue with our patterns" }).click();
  await page.getByRole("searchbox", { name: "Search patterns" }).fill("zzzz");
  await expect(page.getByRole("heading", { name: "No patterns match" })).toBeVisible();
  await expectStructure(page, "pattern stage, no matches");
  await page.getByRole("searchbox", { name: "Search patterns" }).fill("");
  await chooseRadio(page, "Terrace wave");

  await page.getByRole("button", { name: "Continue to Preview" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Preview your/ })).toBeVisible();
  await expectStructure(page, "preview stage");

  await page.getByRole("button", { name: "Continue to Review" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "SewnCovers configuration summary" })).toBeVisible();
  await expectStructure(page, "review stage");
  await page.getByRole("button", { name: "Save to My projects" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to save this design" })).toBeVisible();
  await expectStructure(page, "review stage, save sign-in");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await page.getByRole("button", { name: "Save and create share link" }).click();
  await expect(page.getByRole("textbox", { name: "Share URL" })).toBeVisible();
  await expectStructure(page, "review stage, share link created");
});

test("a signed-in visitor's configurator panels keep the outline sound", async ({ page }) => {
  test.setTimeout(120_000);
  await fixtures(page, "customer");
  await enableUploads(page);

  await page.goto(`${base}/configure/?design=${publicId}`);
  await expect(page.getByText("Shared design restored.")).toBeVisible();
  for (const stage of ["Measurements", "Cover details", "Pattern"]) {
    await page.getByRole("button", { name: `Continue to ${stage}` }).click();
  }
  await expect(page.getByText("Garden repeat", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rename" }).click();
  await expectStructure(page, "pattern stage, rename question");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expectStructure(page, "pattern stage, delete question");
  await page.keyboard.press("Escape");
  await expectStructure(page, "pattern stage, uploads");

  await chooseRadio(page, "Terrace wave");
  for (const stage of ["Preview", "Review"]) {
    await page.getByRole("button", { name: `Continue to ${stage}` }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: "SewnCovers configuration summary" })).toBeVisible();
  await expectStructure(page, "review stage, signed in");
});

test("the keep-your-design question keeps the outline sound", async ({ page }) => {
  await fixtures(page, "guest");
  await page.goto(`${base}/configure/`);
  await page.getByText("Rectangle cushion", { exact: true }).click();
  await page.getByRole("button", { name: "Continue to Measurements" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Measure your/ })).toBeVisible();

  // A design link would replace the unsaved design kept in this browser.
  await page.goto(`${base}/configure/?design=${publicId}`);
  await expect(page.getByRole("heading", { name: "Keep your unsaved design?" })).toBeVisible();
  await expectStructure(page, "keep your unsaved design");
});

test("a signed-out visitor sees one Sign in link on the account page, and one elsewhere", async ({ page }) => {
  await fixtures(page, "guest");

  // The header leaves its Sign in link out where the form's own tab is on
  // screen: two links with the same name and different return targets would
  // be ambiguous to voice control and to a list of links.
  await page.goto(`${base}/account/?mode=login&returnTo=projects`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Sign in" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Authentication options" }).getByRole("link", { name: "Sign in" }),
  ).toHaveAttribute("href", /returnTo=projects$/);

  // Anywhere else the header link is the way in.
  await page.goto(`${base}/configure/`);
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Sign in" }),
  ).toHaveCount(1);
});
