import { expect, test, type Page } from "@playwright/test";

import {
  api,
  base,
  fixtures,
  id,
  project,
  quote,
} from "./support/api-fixtures";
import { chooseRadio } from "./support/keyboard";

// In forced-colours (high-contrast) mode the browser replaces author colours
// with the system palette. A fabric swatch exists to show the customer's own
// colour, so it opts out with forced-color-adjust and is outlined in the
// system text colour. Without that, every swatch would turn into the page
// background and the chosen colour would vanish.

const chosen = "#3F6C7F";
const chosenRgb = "rgb(63, 108, 127)";
const publicId = "AbCdEfGhIjKlMnOpQrStUv";

async function chooseSolidColour(page: Page) {
  await chooseRadio(page, "Solid colour");
}

/** Every swatch on the page must keep its colour and show an outline. */
async function expectSwatchesKeepTheirColour(page: Page, where: string) {
  const swatches = await page
    .locator(".fabric-swatch")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderTopStyle: style.borderTopStyle,
          borderTopWidth: Number.parseFloat(style.borderTopWidth),
          forcedColorAdjust: style.forcedColorAdjust,
        };
      }),
    );

  expect(swatches.length, `${where}: no swatch on the page`).toBeGreaterThan(0);
  for (const swatch of swatches) {
    expect(swatch.forcedColorAdjust, where).toBe("none");
    expect(swatch.backgroundColor, where).toBe(chosenRgb);
    expect(swatch.borderTopStyle, where).not.toBe("none");
    expect(swatch.borderTopWidth, where).toBeGreaterThan(0);
  }
  return swatches;
}

test("keeps the chosen fabric colour on every swatch in the configurator", async ({
  page,
}) => {
  await fixtures(page, "guest");
  await page.emulateMedia({ forcedColors: "active" });
  expect(
    await page.evaluate(() => matchMedia("(forced-colors: active)").matches),
  ).toBe(true);

  await page.goto(`${base}/configure/?design=${publicId}`);
  await expect(page.getByText("Shared design restored.")).toBeVisible();
  await page.getByRole("button", { name: "Continue to Measurements" }).click();
  await page.getByRole("button", { name: "Continue to Cover details" }).click();
  await page.getByRole("button", { name: "Continue to Pattern" }).click();

  // The Plain colour card and the "Current selections" ticket.
  await chooseSolidColour(page);
  await page.getByRole("textbox", { name: "Colour code" }).fill(chosen);
  await expect(page.getByRole("textbox", { name: "Colour code" })).toHaveValue(
    chosen,
  );
  const onPatternStage = await expectSwatchesKeepTheirColour(
    page,
    "pattern stage",
  );
  expect(onPatternStage.length).toBeGreaterThanOrEqual(2);

  // The Preview stage's fabric row, then the Review summary and its preview.
  await page.getByRole("button", { name: "Continue to Preview" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /^Preview your/ }),
  ).toBeVisible();
  await expectSwatchesKeepTheirColour(page, "preview stage");
  await page.getByRole("button", { name: "Continue to Review" }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "SewnCovers configuration summary",
    }),
  ).toBeVisible();
  await expectSwatchesKeepTheirColour(page, "review stage");
});

test("keeps the chosen fabric colour on swatches in saved projects and the cart", async ({
  page,
}) => {
  await fixtures(page, "customer");
  const configuration = {
    ...project.currentVersion.configuration,
    pattern: { kind: "solid", color: chosen },
  };
  const version = { ...project.currentVersion, configuration };
  const cart = {
    id,
    demonstration: true,
    state: "active",
    currency: "CAD",
    lines: [
      {
        id,
        quote: { ...quote, configuration },
        quantity: 1,
        extendedAmountMinor: 10450,
      },
    ],
    subtotalAmountMinor: 10450,
    subtotalFormatted: "$104.50 CAD",
    notices: [],
  };
  // Registered after the shared fixtures, so these answers win.
  await page.route(`${api}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3100",
      "access-control-allow-headers": "authorization, content-type",
      "content-type": "application/json",
    };
    const answers: Record<string, unknown> = {
      [`/projects/${id}`]: { ...project, currentVersion: version },
      [`/projects/${id}/versions`]: [version],
      "/commerce/cart": cart,
    };
    if (route.request().method() !== "GET" || !(pathname in answers)) {
      await route.fallback();
      return;
    }
    await route.fulfill({ body: JSON.stringify(answers[pathname]), headers });
  });
  await page.emulateMedia({ forcedColors: "active" });

  await page.goto(`${base}/projects/?project=${id}`);
  await expect(
    page.getByRole("heading", { name: "Version history" }),
  ).toBeVisible();
  // The small chip beside the fabric name and the larger preview block.
  expect(
    await expectSwatchesKeepTheirColour(page, "saved project"),
  ).toHaveLength(2);

  await page.goto(`${base}/cart/`);
  await expect(page.getByText("Quote subtotal:")).toBeVisible();
  expect(await expectSwatchesKeepTheirColour(page, "cart")).toHaveLength(1);
});

test("outlines a swatch in the system text colour so it stays visible", async ({
  page,
}) => {
  await fixtures(page, "guest");
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto(`${base}/configure/?design=${publicId}`);
  await expect(page.getByText("Shared design restored.")).toBeVisible();
  for (const stage of ["Measurements", "Cover details", "Pattern"]) {
    await page.getByRole("button", { name: `Continue to ${stage}` }).click();
  }
  await chooseSolidColour(page);

  const border = await page
    .locator(".fabric-swatch")
    .first()
    .evaluate((element) => {
      // CanvasText resolves to the system text colour in forced-colours mode.
      const probe = document.createElement("span");
      probe.style.color = "CanvasText";
      document.body.append(probe);
      const systemText = getComputedStyle(probe).color;
      probe.remove();
      return { actual: getComputedStyle(element).borderTopColor, systemText };
    });
  expect(border.actual).toBe(border.systemText);
});
