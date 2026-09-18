import path from "node:path";

import { expect, test } from "@playwright/test";

const apiOrigin = "https://sewncovers-api.onrender.com";
const basePath =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const screenshotDirectory = path.resolve("screenshots/solid-color");

const patterns = [
  {
    id: "fern-trail",
    name: "Fern trail",
    description: "Layered fronds arranged along a gentle diagonal trail.",
    categoryId: "botanical",
    colorIds: ["ivory", "green"],
    previewClassName: "api-fern-trail",
  },
  {
    id: "diamond-path",
    name: "Diamond path",
    description: "Nested diamonds repeat in crisp offset rows.",
    categoryId: "geometric",
    colorIds: ["ivory", "blue", "charcoal"],
    previewClassName: "api-diamond-path",
  },
];

test("captures the solid-fabric selection and live previews", async ({
  context,
  page,
}) => {
  await context.route(`${apiOrigin}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      body: JSON.stringify(patterns),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${basePath}/configure/`);
  await page.getByText("Square cushion", { exact: true }).click();
  await page
    .getByRole("button", { name: "Continue to Measurements" })
    .click();
  await page.getByRole("textbox", { name: "Width (cm)" }).fill("50");
  await page.getByRole("textbox", { name: "Thickness (cm)" }).fill("10");
  await page
    .getByRole("button", { name: "Continue to Cover details" })
    .click();
  await page.getByRole("button", { name: "Continue to Pattern" }).click();
  await expect(page.getByRole("radio", { name: "Solid color" })).toBeVisible();

  await page.screenshot({
    path: path.join(screenshotDirectory, "01-solid-color-option.png"),
  });

  await page.getByRole("radio", { name: "Solid color" }).focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("heading", { name: "Choose your fabric color" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, "02-color-picker-open.png"),
  });

  const hex = page.getByRole("textbox", { name: "Hexadecimal color" });
  const livePreview = page.getByRole("figure", {
    name: /Live cushion preview/,
  });
  await hex.fill("#F5F2EB");
  await expect(hex).toHaveValue("#F5F2EB");
  await livePreview.screenshot({
    path: path.join(screenshotDirectory, "03-light-solid-preview.png"),
  });

  await hex.fill("#111827");
  await expect(hex).toHaveValue("#111827");
  await livePreview.screenshot({
    path: path.join(screenshotDirectory, "04-dark-solid-preview.png"),
  });
});
