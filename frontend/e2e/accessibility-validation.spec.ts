import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";

import { expectStageFocused } from "./support/keyboard";

const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://api.sewncovers.test";
const basePath =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const configurePath = `${basePath}/configure/`;
const publicId = "AbCdEfGhIjKlMnOpQrStUv";

const patternRecords = [
  ["prototype-botanical", "Seed scatter", "botanical", ["ivory", "green"]],
  ["fern-trail", "Fern trail", "botanical", ["ivory", "green"]],
  ["meadow-sprig", "Meadow sprig", "botanical", ["ivory", "blue", "gold"]],
  ["prototype-geometric", "Harlequin", "geometric", ["ivory", "terracotta"]],
  ["diamond-path", "Diamond path", "geometric", ["ivory", "blue", "charcoal"]],
  ["arch-grid", "Arch grid", "geometric", ["ivory", "terracotta", "gold"]],
  ["harbor-stripe", "Harbour stripe", "striped", ["ivory", "blue"]],
  ["orchard-stripe", "Orchard stripe", "striped", ["ivory", "green", "gold"]],
  [
    "ribbon-stripe",
    "Ribbon stripe",
    "striped",
    ["ivory", "terracotta", "rose"],
  ],
  ["prototype-woven", "Fine weave", "woven", ["ivory", "charcoal"]],
  ["basket-check", "Basket check", "woven", ["ivory", "blue", "charcoal"]],
  ["linen-crosshatch", "Linen crosshatch", "woven", ["ivory", "gold"]],
] as const;

const patterns = patternRecords.map(([id, name, categoryId, colorIds]) => ({
  id,
  name,
  description: `Mocked ${name.toLowerCase()} direction.`,
  categoryId,
  colorIds,
  previewClassName: `api-${id}`,
}));

const savedDesign = Object.freeze({
  shape: "box",
  width: 72.25,
  height: 48.5,
  thickness: 12.75,
  unit: "cm",
  patternId: "fern-trail",
  patternScale: 1.3,
});

const corsHeaders = {
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-origin": appOrigin,
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    headers: { ...corsHeaders, "content-type": "application/json" },
    status,
  });
}

async function mockApi(context: BrowserContext) {
  await context.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
    } else if (request.method() === "GET" && url.pathname === "/patterns") {
      await fulfillJson(route, patterns);
    } else if (
      request.method() === "GET" &&
      url.pathname === "/uploads/availability"
    ) {
      // As in production: custom uploads are off.
      await fulfillJson(route, { enabled: false });
    } else if (
      request.method() === "GET" &&
      url.pathname === `/designs/${publicId}`
    ) {
      await fulfillJson(route, { ...savedDesign, publicId });
    } else if (request.method() === "POST" && url.pathname === "/designs") {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await fulfillJson(
        route,
        { ...(request.postDataJSON() as typeof savedDesign), publicId },
        201,
      );
    } else {
      await fulfillJson(route, { errors: [] }, 404);
    }
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));

  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map(
    (index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

test.beforeEach(async ({ context }) => {
  await mockApi(context);
});

test("keeps the complete configurator responsive with usable touch targets", async ({
  page,
}) => {
  for (const viewport of [
    { height: 568, name: "mobile", width: 320 },
    { height: 667, name: "small mobile", width: 375 },
    { height: 932, name: "large mobile", width: 430 },
    { height: 1024, name: "tablet", width: 768 },
    { height: 900, name: "desktop", width: 1440 },
  ]) {
    await test.step(viewport.name, async () => {
      await page.setViewportSize(viewport);
      await page.goto(`${configurePath}?design=${publicId}`);
      await expect(
        page.getByRole("status").filter({
          hasText: "Shared design restored.",
        }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const targetSizes = await page.evaluate(() => {
        const selectors = [
          ".shape-option-label",
          ".cover-option-label",
          ".unit-selector-label",
          ".pattern-filter-label",
          ".pattern-card-label",
          "button:not(:disabled)",
          "input:not([type='radio'])",
        ].join(",");

        return Array.from(document.querySelectorAll<HTMLElement>(selectors))
          .filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
            );
          })
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              height: rect.height,
              label:
                element.getAttribute("aria-label") ??
                element.textContent?.trim().slice(0, 40),
              width: rect.width,
            };
          });
      });
      expect(targetSizes.length).toBeGreaterThan(0);
      expect(
        targetSizes.filter((target) => target.height < 44 || target.width < 44),
      ).toEqual([]);

      for (const nextStage of [
        "Measurements",
        "Cover details",
        "Pattern",
        "Preview",
        "Review",
      ]) {
        await page
          .getByRole("button", { name: `Continue to ${nextStage}` })
          .click();
        await expectNoHorizontalOverflow(page);
      }
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "SewnCovers configuration summary",
        }),
      ).toBeFocused();
      await expect(page.locator("h1")).toHaveCount(1);
      await expectNoHorizontalOverflow(page);
    });
  }
});

test("gates stages and preserves compatible downstream choices when revisiting", async ({
  page,
}) => {
  await page.goto(configurePath);
  // Stages are buttons, so the progress is a labelled group, not a landmark.
  const progress = page.getByRole("group", {
    name: "Configuration progress",
  });

  await expect(
    page.getByRole("button", { name: "Continue to Measurements" }),
  ).toBeDisabled();
  await expect(page.getByRole("heading", { name: /Measure your/ })).toHaveCount(
    0,
  );
  await expect(progress.getByRole("button", { name: /^Pattern/ })).toHaveCount(
    0,
  );

  await page.getByText("Rectangle cushion", { exact: true }).click();
  await page.getByRole("button", { name: "Continue to Measurements" }).click();
  await expect(
    page.getByText("Measure your rectangle cushion", { exact: true }),
  ).toBeFocused();

  const width = page.getByRole("textbox", { name: "Width (cm)" });
  await width.fill("9");
  await page.getByRole("textbox", { name: "Height (cm)" }).fill("40");
  await page.getByRole("textbox", { name: "Thickness (cm)" }).fill("10");
  await width.press("Tab");
  await expect(
    page.getByRole("status").filter({ hasText: "must be 10–300 cm" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to Cover details" }),
  ).toBeDisabled();

  await width.fill("80");
  await page.getByRole("button", { name: "Continue to Cover details" }).click();
  await page.getByRole("radio", { name: "Linen blend" }).check();
  await page.getByRole("button", { name: "Continue to Pattern" }).click();
  await page.getByText("Fern trail", { exact: true }).click();
  await page.getByRole("button", { name: "Continue to Preview" }).click();
  await page.getByRole("slider", { name: "Pattern size" }).fill("1.4");
  await page.getByRole("button", { name: "Continue to Review" }).click();
  await expect(
    page.getByRole("heading", { name: "SewnCovers configuration summary" }),
  ).toBeFocused();

  await page.getByRole("button", { name: "Back to Preview" }).click();
  await expect(page.getByRole("slider", { name: "Pattern size" })).toHaveValue(
    "1.4",
  );
  await progress
    .getByRole("button", {
      name: "Measurements complete, stage 2 of 6",
    })
    .click();
  await expect(width).toHaveValue("80");
  await expectStageFocused(page, "Measurements");
  await page.getByRole("radio", { name: "Inches (in)" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("textbox", { name: "Width (in)" })).toHaveValue(
    "31.5",
  );
  await progress
    .getByRole("button", {
      name: "Review complete, stage 6 of 6",
    })
    .click();
  await expect(
    page.getByRole("region", { name: "Configuration details", exact: true }),
  ).toContainText("31.5 in");

  // Review has no edit row; the stage progress is the way back.
  await progress
    .getByRole("button", { name: "Shape complete, stage 1 of 6" })
    .click();
  await page.getByText("Tapered / trapezoid cushion", { exact: true }).click();
  await expect(progress.getByRole("button", { name: /^Pattern/ })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Continue to Measurements" }).click();
  await expectStageFocused(page, "Measurements");
  await page.getByRole("textbox", { name: "Back width (in)" }).fill("20");
  await progress
    .getByRole("button", {
      name: "Pattern complete, stage 4 of 6",
    })
    .click();
  await expect(page.getByRole("radio", { name: "Fern trail" })).toBeChecked();
});

test("supports keyboard-only editing, validation, save, and clipboard flow", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: appOrigin,
  });
  await page.goto(configurePath);

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("radio", { name: "Square cushion" }),
  ).toBeFocused();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("radio", { name: "Square cushion" }),
  ).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("radio", { name: "Rectangle cushion" }),
  ).toBeChecked();

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Continue to Measurements" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Measure your rectangle cushion", { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("radio", { name: "Centimetres (cm)" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  const width = page.getByRole("textbox", { name: "Width (cm)" });
  await expect(width).toBeFocused();
  await page.keyboard.type("72.123");
  await page.keyboard.press("Tab");
  await expect(width).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByRole("status").filter({ hasText: "two decimal places" }),
  ).toBeVisible();
  const height = page.getByRole("textbox", { name: "Height (cm)" });
  await expect(height).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(width).toBeFocused();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("72.25");
  await page.keyboard.press("Tab");
  await expect(height).toBeFocused();
  await page.keyboard.type("48.5");
  await page.keyboard.press("Tab");
  await page.keyboard.type("12.75");
  await page.keyboard.press("Tab");
  await expect(page.getByText("More measuring tips")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Back to Shape" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Continue to Cover details" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Choose cover details" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("radio", { name: "Cotton canvas" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Linen blend" })).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "Standard fit" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("radio", { name: "More relaxed fit" }),
  ).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("radio", { name: "Zipper access" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("radio", { name: "Envelope opening" }),
  ).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "Plain seam" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Piped edge" })).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Back to Measurements" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Continue to Pattern" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 1, name: "Choose a colour or pattern" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "Solid colour" })).toBeFocused();
  // Uploads are off, as in production, so nothing to tab to in between.
  await expect(
    page.getByText("Custom uploads aren't enabled in this demo."),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("searchbox", { name: "Search patterns" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "All styles" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "All colours" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "Seed scatter" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Fern trail" })).toBeChecked();
  // Every pattern is already shown, so no disclosure button follows.
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Back to Cover details" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Continue to Preview" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("slider", { name: "Pattern size" }),
  ).toBeFocused();
  // After the slider: Smaller, Larger, the three contextual edit actions,
  // Back to Pattern, then Continue to Review.
  for (const name of [
    "Smaller",
    "Larger",
    "Edit measurements",
    "Edit cover details",
    "Change pattern",
    "Back to Pattern",
    "Continue to Review",
  ]) {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "SewnCovers configuration summary",
    }),
  ).toBeFocused();
  // Print and Download precede the save button; there is no edit row.
  for (const name of ["Print summary", "Download summary (.txt)"]) {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Save and create share link" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");

  const shareUrl = page.getByRole("textbox", { name: "Share URL" });
  await expect(shareUrl).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Copy share link" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "copied to your clipboard" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${appOrigin}${configurePath}?design=${publicId}`);
});

test("gives every stage one h1, a matching tab title and announcement, and the first shape card above the fold", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(configurePath);

  const outline = () =>
    page.evaluate(() => ({
      h1: Array.from(document.querySelectorAll("h1")).map((heading) =>
        heading.textContent?.trim(),
      ),
      skips: Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
        .map((heading) => Number(heading.tagName.slice(1)))
        .filter(
          (level, index, levels) => index > 0 && level > levels[index - 1] + 1,
        ),
    }));
  const title = (stage: string, index: number) =>
    `${stage} (stage ${index} of 6) – Configure a cushion | SewnCovers`;

  // Stage 1 keeps the page introduction, short enough for the first card.
  await expect(
    page.getByRole("heading", { level: 2, name: "Choose your cushion shape" }),
  ).toBeVisible();
  expect(await outline()).toEqual({
    h1: ["Build your custom cover design."],
    skips: [],
  });
  await expect(page).toHaveTitle(title("Shape", 1));
  const firstCard = await page
    .locator(".shape-option-label")
    .first()
    .boundingBox();
  expect(firstCard).not.toBeNull();
  expect(firstCard!.y).toBeLessThan(844 - 120);

  await page.getByText("Rectangle cushion", { exact: true }).click();
  const stages = [
    ["Measurements", 2, "Measure your rectangle cushion"],
    ["Cover details", 3, "Choose cover details"],
    ["Pattern", 4, "Choose a colour or pattern"],
    ["Preview", 5, "Preview your rectangle cushion"],
    ["Review", 6, "SewnCovers configuration summary"],
  ] as const;
  for (const [stage, index, heading] of stages) {
    await page.getByRole("button", { name: `Continue to ${stage}` }).click();
    if (stage === "Measurements") {
      await expectStageFocused(page, "Measurements");
      await page.getByRole("textbox", { name: "Width (cm)" }).fill("80");
      await page.getByRole("textbox", { name: "Height (cm)" }).fill("40");
      await page.getByRole("textbox", { name: "Thickness (cm)" }).fill("10");
    }
    if (stage === "Pattern") {
      await page.getByText("Fern trail", { exact: true }).click();
    }
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
    await expect(page).toHaveTitle(title(stage, index));
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: `Stage ${index} of 6: ${stage}.` }),
    ).toHaveCount(1);
    // The introduction is not repeated after the first stage.
    await expect(page.getByText("Build your custom cover design.")).toHaveCount(
      0,
    );
    expect(await outline()).toEqual({ h1: [heading], skips: [] });
  }
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "SewnCovers configuration summary",
    }),
  ).toBeFocused();

  // Going back keeps the same rules, and focus lands on the stage heading.
  await page.getByRole("button", { name: "Back to Preview" }).click();
  await expect(
    page.getByRole("slider", { name: "Pattern size" }),
  ).toBeFocused();
  await expect(page).toHaveTitle(title("Preview", 5));

  // Leaving the configurator gives the next page its own title back.
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Legal and privacy" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Legal information" }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Legal information | SewnCovers");
});

test("preserves semantic, contrast, forced-colors, and reduced-motion feedback", async ({
  page,
}) => {
  let releaseSave: (() => void) | undefined;
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route(`${apiOrigin}/designs`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await saveGate;
    await fulfillJson(
      route,
      {
        ...(route.request().postDataJSON() as typeof savedDesign),
        publicId,
      },
      201,
    );
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${configurePath}?design=${publicId}`);
  await expect(
    page.getByRole("status").filter({ hasText: "Shared design restored." }),
  ).toBeVisible();

  const structure = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll<HTMLElement>("[id]")).map(
      (element) => element.id,
    );
    const references = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[aria-labelledby],[aria-describedby]",
      ),
    ).flatMap((element) =>
      ["aria-labelledby", "aria-describedby"].flatMap((attribute) =>
        (element.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean),
      ),
    );
    const headings = Array.from(
      document.querySelectorAll("h1,h2,h3,h4,h5,h6"),
    ).map((heading) => Number(heading.tagName.slice(1)));

    return {
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      headingSkips: headings.filter(
        (level, index) => index > 0 && level > headings[index - 1] + 1,
      ),
      mainCount: document.querySelectorAll("main").length,
      missingReferences: references.filter(
        (id) => document.getElementById(id) === null,
      ),
      navigationLabels: Array.from(document.querySelectorAll("nav")).map(
        (navigation) => navigation.getAttribute("aria-label"),
      ),
    };
  });
  expect(structure).toEqual({
    duplicateIds: [],
    headingSkips: [],
    mainCount: 1,
    missingReferences: [],
    // Only real navigation is a landmark; button groups are role="group".
    navigationLabels: ["Primary navigation", "Footer navigation"],
  });

  const tokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const read = (name: string) => styles.getPropertyValue(name).trim();
    return Object.fromEntries(
      [
        "--color-page",
        "--color-surface",
        "--color-surface-subtle",
        "--color-text-muted",
        "--color-brand",
        "--color-on-brand",
        "--color-accent-strong",
        "--color-border-strong",
        "--color-focus",
        "--color-error-surface",
        "--color-error-border",
        "--color-error-text",
        "--color-notice-surface",
        "--color-notice-border",
        "--color-notice-text",
        "--color-success-surface",
        "--color-success-border",
        "--color-success-text",
        "--color-control-disabled-surface",
        "--color-control-disabled-text",
        "--color-control-disabled-border",
      ].map((name) => [name, read(name)]),
    );
  });
  const ratio = (first: string, second: string) =>
    contrastRatio(tokens[`--color-${first}`], tokens[`--color-${second}`]);
  for (const [foreground, background] of [
    ["text-muted", "page"],
    ["text-muted", "surface"],
    ["text-muted", "surface-subtle"],
    ["brand", "surface"],
    ["on-brand", "brand"],
    ["accent-strong", "surface"],
    ["error-text", "error-surface"],
    ["notice-text", "notice-surface"],
    // Confirmation banners, and the text of a disabled control on its own
    // fill (disabled controls are exempt from WCAG, but stay readable).
    ["success-text", "success-surface"],
    ["success-text", "surface"],
    ["control-disabled-text", "control-disabled-surface"],
    ["control-disabled-text", "page"],
  ]) {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  }
  for (const [foreground, background] of [
    ["border-strong", "surface"],
    ["focus", "surface"],
    ["focus", "page"],
    ["error-border", "error-surface"],
    ["notice-border", "notice-surface"],
    ["success-border", "success-surface"],
    ["success-border", "surface"],
    ["control-disabled-border", "control-disabled-surface"],
    ["control-disabled-border", "page"],
  ]) {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(3);
  }

  const motion = await page.evaluate(() => ({
    labelTransitionProperty: getComputedStyle(
      document.querySelector<HTMLElement>(".shape-option-label")!,
    ).transitionProperty,
  }));
  expect(motion.labelTransitionProperty).toBe("none");

  for (const nextStage of [
    "Measurements",
    "Cover details",
    "Pattern",
    "Preview",
    "Review",
  ]) {
    await page
      .getByRole("button", { name: `Continue to ${nextStage}` })
      .click();
  }
  await page
    .getByRole("button", { name: "Save and create share link" })
    .click();
  const spinner = page.locator(".motion-safe\\:animate-spin");
  await expect(spinner).toBeVisible();
  expect(
    await spinner.evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
  ).toBe("none");
  await expect(
    page.getByRole("status").filter({ hasText: "Connecting" }),
  ).toBeVisible();
  releaseSave?.();
  await expect(page.getByRole("textbox", { name: "Share URL" })).toBeFocused();

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const width = page.getByRole("textbox", { name: "Share URL" });
  await width.focus();
  await expect
    .poll(() =>
      width.evaluate((element) => getComputedStyle(element).outlineStyle),
    )
    .not.toBe("none");
});

test("gives headings that script moves focus to the token focus ring", async ({
  page,
}) => {
  // The account page focuses its form heading on arrival, as the restore
  // question and the sign-in panels do.
  await page.goto(`${basePath}/account/?mode=register`);
  const heading = page.getByRole("heading", { name: "Create account" });
  await expect(heading).toBeFocused();

  const ring = await heading.evaluate((element) => {
    const probe = document.createElement("i");
    probe.style.color = "var(--color-focus)";
    document.body.append(probe);
    const focusColour = getComputedStyle(probe).color;
    probe.remove();
    const style = getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      focusColour,
      outlineStyle: style.outlineStyle,
    };
  });
  // --shadow-focus: a surface-coloured inner ring and a focus-coloured outer
  // ring; the transparent outline keeps a ring in forced-colours mode.
  expect(ring.boxShadow).not.toBe("none");
  expect(ring.boxShadow).toContain(ring.focusColour);
  expect(ring.outlineStyle).toBe("solid");
});

test("shows the focus ring at once, without fading the outline in", async ({
  page,
}) => {
  // Tailwind's transition-colors (and transition, transition-all) include
  // outline-color. The ring is drawn with a transparent outline, so if the
  // outline started from the control's text colour the ring would flash dark
  // for a moment as it faded in. Tab through each page and require that no
  // focused control (or the label that draws a hidden input's ring) starts an
  // outline-color transition.
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const route of [
    "/",
    "/legal/",
    "/account/",
    "/commerce/",
    "/configure/?design=" + publicId,
  ]) {
    await page.goto(`${basePath}${route}`);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    const flashes: string[] = [];
    for (let stop = 0; stop < 24; stop += 1) {
      await page.keyboard.press("Tab");
      flashes.push(
        ...(await page.evaluate(() => {
          const focused = document.activeElement as HTMLElement | null;
          if (!focused || focused === document.body) return [];
          const ringDrawers = [
            focused,
            focused.nextElementSibling,
            focused.closest("label"),
          ];
          return ringDrawers
            .filter(
              (element): element is HTMLElement =>
                element instanceof HTMLElement,
            )
            .filter((element) =>
              element
                .getAnimations()
                .some(
                  (animation) =>
                    animation instanceof CSSTransition &&
                    animation.transitionProperty === "outline-color",
                ),
            )
            .map(
              (element) =>
                `<${element.tagName.toLowerCase()}> ${(element.textContent ?? "").trim().slice(0, 40)}`,
            );
        })),
      );
    }
    expect(flashes, route).toEqual([]);
  }

  // Forced colours: the ring colour is the system one from the start.
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto(`${basePath}/`);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const animating = await page.evaluate(
    () =>
      (document.activeElement as HTMLElement)
        .getAnimations()
        .filter(
          (animation) =>
            animation instanceof CSSTransition &&
            animation.transitionProperty === "outline-color",
        ).length,
  );
  expect(animating).toBe(0);
});
