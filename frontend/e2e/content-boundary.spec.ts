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
  await expect(page.getByRole("link", { name: "Continue configuring as a guest" })).toBeVisible();
  await expectCustomerLanguage(page);

  for (const [route, heading, lockedHeading] of [
    ["commerce", "Pricing and quotes", "Sign in to create an owned demonstration quote"],
    ["cart", "Cart", "Sign in to view your demonstration cart"],
    ["orders", "Orders", "Sign in to view demonstration orders"],
  ] as const) {
    await page.goto(`${basePath}/${route}/`);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText(/Fictional CAD prices and payment events only/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: lockedHeading })).toBeVisible();
    await expectCustomerLanguage(page);
  }

  await page.goto(`${basePath}/account/`);
  await expect(page.getByRole("heading", { name: "Account and privacy controls" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator("form")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Create account" })).toHaveCount(0);
  await page.getByRole("link", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await expect(page.getByText(/Email verification and password recovery are unavailable/i)).toBeVisible();
  await expectCustomerLanguage(page);
});

test("keeps implementation evidence in Trust and legal disclosures in Legal", async ({
  page,
}) => {
  await page.goto(`${basePath}/legal/`);
  await expect(page.getByRole("heading", { name: "Legal and consent information" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Privacy notice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Custom upload and moderation notice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demonstration commerce and fulfilment notice" })).toBeVisible();
});
