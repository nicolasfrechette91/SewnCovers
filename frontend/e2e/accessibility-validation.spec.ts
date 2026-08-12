import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";

const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://api.sewncovers.test";
const basePath =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true"
    ? "/SewnCovers"
    : "";
const configurePath = `${basePath}/configure/`;
const publicId = "AbCdEfGhIjKlMnOpQrStUv";

const patternRecords = [
  ["prototype-botanical", "Botanical sample", "botanical", ["ivory", "green"]],
  ["fern-trail", "Fern trail", "botanical", ["ivory", "green"]],
  ["meadow-sprig", "Meadow sprig", "botanical", ["ivory", "blue", "gold"]],
  ["prototype-geometric", "Geometric sample", "geometric", ["ivory", "terracotta"]],
  ["diamond-path", "Diamond path", "geometric", ["ivory", "blue", "charcoal"]],
  ["arch-grid", "Arch grid", "geometric", ["ivory", "terracotta", "gold"]],
  ["harbor-stripe", "Harbor stripe", "striped", ["ivory", "blue"]],
  ["orchard-stripe", "Orchard stripe", "striped", ["ivory", "green", "gold"]],
  ["ribbon-stripe", "Ribbon stripe", "striped", ["ivory", "terracotta", "rose"]],
  ["prototype-woven", "Woven sample", "woven", ["ivory", "charcoal"]],
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
  const channels = [1, 3, 5].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
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
            return style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          })
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              height: rect.height,
              label: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40),
              width: rect.width,
            };
          });
      });
      expect(targetSizes.length).toBeGreaterThan(0);
      expect(
        targetSizes.filter((target) => target.height < 44 || target.width < 44),
      ).toEqual([]);

      await page
        .getByRole("button", { name: "Review configuration" })
        .click();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "SewnCovers configuration summary",
        }),
      ).toBeFocused();
      await expectNoHorizontalOverflow(page);
    });
  }
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
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "Square cushion" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: "Square cushion" })).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Rectangle cushion" })).toBeChecked();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "Centimetres (cm)" })).toBeFocused();
  await page.keyboard.press("Tab");
  const width = page.getByRole("textbox", { name: "Width (cm)" });
  await expect(width).toBeFocused();
  await page.keyboard.type("72.123");
  await page.keyboard.press("Tab");
  await expect(width).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("status").filter({ hasText: "two decimal places" })).toBeVisible();
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
  await expect(page.getByRole("radio", { name: "All categories" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "All colors" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "Botanical sample" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Fern trail" })).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("slider", { name: "Pattern size" })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Review configuration" })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "SewnCovers configuration summary",
    }),
  ).toBeFocused();
  for (let index = 0; index < 7; index += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(
    page.getByRole("button", { name: "Save and create share link" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");

  const shareUrl = page.getByRole("textbox", { name: "Share URL" });
  await expect(shareUrl).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Copy share link" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "copied to your clipboard" }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${appOrigin}${configurePath}?design=${publicId}`,
  );
});

test("preserves semantic, contrast, forced-colors, and reduced-motion feedback", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${configurePath}?design=${publicId}`);
  await expect(page.getByRole("status").filter({ hasText: "Shared design restored." })).toBeVisible();

  const structure = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll<HTMLElement>("[id]")).map(
      (element) => element.id,
    );
    const references = Array.from(
      document.querySelectorAll<HTMLElement>("[aria-labelledby],[aria-describedby]"),
    ).flatMap((element) =>
      ["aria-labelledby", "aria-describedby"].flatMap((attribute) =>
        (element.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean),
      ),
    );
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map(
      (heading) => Number(heading.tagName.slice(1)),
    );

    return {
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      headingSkips: headings.filter(
        (level, index) => index > 0 && level > headings[index - 1] + 1,
      ),
      mainCount: document.querySelectorAll("main").length,
      missingReferences: references.filter((id) => document.getElementById(id) === null),
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
    navigationLabels: ["Primary navigation", "Configuration progress"],
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
  ]) {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  }
  for (const [foreground, background] of [
    ["border-strong", "surface"],
    ["focus", "surface"],
    ["focus", "page"],
    ["error-border", "error-surface"],
  ]) {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(3);
  }

  const motion = await page.evaluate(() => ({
    labelTransitionProperty: getComputedStyle(
      document.querySelector<HTMLElement>(".shape-option-label")!,
    ).transitionProperty,
  }));
  expect(motion.labelTransitionProperty).toBe("none");

  await page.getByRole("button", { name: "Review configuration" }).click();
  await page.getByRole("button", { name: "Save and create share link" }).click();
  const spinner = page.locator(".motion-safe\\:animate-spin");
  await expect(spinner).toBeVisible();
  expect(
    await spinner.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await expect(page.getByRole("status").filter({ hasText: "Connecting" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Share URL" })).toBeFocused();

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const width = page.getByRole("textbox", { name: "Share URL" });
  await width.focus();
  await expect
    .poll(() => width.evaluate((element) => getComputedStyle(element).outlineStyle))
    .not.toBe("none");
});
