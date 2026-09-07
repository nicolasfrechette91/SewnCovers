import { expect, test, type Page } from "@playwright/test";

const basePath =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";

async function expectCustomerLanguage(page: Page) {
  await expect(page.locator("body")).not.toContainText(
    /bearer token|immutable record|raw-body webhook|private-asset grant|configured-only provider/i,
  );
}

test("keeps guest pages task-focused while preserving prototype and account disclosures", async ({
  page,
}) => {
  await page.goto(`${basePath}/`);
  await expect(page.getByRole("link", { name: "Start configuring" })).toBeVisible();
  await expect(page.getByText(/cannot charge money, create a real shipment, or produce finished covers/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "View prototype details" })).toHaveAttribute("href", `${basePath}/trust/`);
  await expectCustomerLanguage(page);

  await page.goto(`${basePath}/configure/`);
  await expect(page.getByRole("heading", { name: "Build your custom cover design." })).toBeVisible();
  await expect(page.getByRole("group", { name: "Choose your cushion shape" })).toBeVisible();
  await expect(page.getByText(/Previews are illustrative and are not manufacturing specifications/i)).toBeVisible();
  await expectCustomerLanguage(page);

  await page.goto(`${basePath}/projects/`);
  await expect(page.getByRole("heading", { name: "My projects" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in to view private projects" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue as guest" })).toBeVisible();
  await expectCustomerLanguage(page);

  for (const [route, heading] of [
    ["commerce", "Pricing and quotes"],
    ["cart", "Cart"],
    ["orders", "Orders"],
  ] as const) {
    await page.goto(`${basePath}/${route}/`);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText(/Fictional CAD prices and payment events only/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in for demonstration commerce" })).toBeVisible();
    await expectCustomerLanguage(page);
  }

  await page.goto(`${basePath}/account/`);
  await expect(page.getByRole("heading", { name: "Account and privacy controls" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
  await expect(page.getByText(/Email verification and password recovery are not available/i)).toBeVisible();
  await expectCustomerLanguage(page);
});

test("keeps implementation evidence in Trust and legal disclosures in Legal", async ({
  page,
}) => {
  await page.goto(`${basePath}/trust/`);
  await expect(page.getByRole("heading", { name: "Trust, boundaries, and readiness" })).toBeVisible();
  await expect(page.getByText(/Account sessions and project-share tokens are stored as hashes/i)).toBeVisible();
  await expect(page.getByText(/Browser-supplied totals are not accepted/i)).toBeVisible();
  await expect(page.getByText(/Verified raw-body webhook processing/i)).toBeVisible();
  await expect(page.getByText(/Configured, not live-verified/i)).toBeVisible();

  await page.goto(`${basePath}/legal/`);
  await expect(page.getByRole("heading", { name: "Legal and consent information" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Privacy notice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Custom upload and moderation notice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demonstration commerce and fulfilment notice" })).toBeVisible();
});
