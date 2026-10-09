import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  base,
  fixtures,
  geometry,
  id,
  orderId,
  routes,
} from "./support/api-fixtures";

const matrix = [
  [320, 568],
  [375, 667],
  [390, 844],
  [430, 932],
  [667, 375],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [512, 384],
];

async function checkDocumentStructure(page: Page, route: string) {
  const structure = await page.evaluate(() => {
    const ids = Array.from(
      document.querySelectorAll<HTMLElement>("[id]"),
      (element) => element.id,
    );
    const references = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[aria-labelledby],[aria-describedby],[aria-controls]",
      ),
    ).flatMap((element) =>
      ["aria-labelledby", "aria-describedby", "aria-controls"].flatMap(
        (attribute) =>
          (element.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean),
      ),
    );
    const controls = Array.from(
      document.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >(
        "input:not([type='hidden']):not([type='button']):not([type='submit']), select, textarea",
      ),
    );
    return {
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      htmlLanguage: document.documentElement.lang,
      imageAlternativeFailures: Array.from(document.images)
        .filter((image) => !image.hasAttribute("alt"))
        .map((image) => image.currentSrc || image.src),
      mainCount: document.querySelectorAll("main").length,
      missingControlNames: controls
        .filter(
          (control) =>
            !control.labels?.length &&
            !control.getAttribute("aria-label") &&
            !control.getAttribute("aria-labelledby") &&
            !control.getAttribute("title"),
        )
        .map((control) => control.outerHTML.slice(0, 160)),
      missingReferences: references.filter(
        (id) => document.getElementById(id) === null,
      ),
      title: document.title,
    };
  });
  expect(structure, route).toEqual({
    duplicateIds: [],
    htmlLanguage: "en",
    imageAlternativeFailures: [],
    mainCount: 1,
    missingControlNames: [],
    missingReferences: [],
    title: expect.stringContaining("SewnCovers"),
  });
  const accessibilityTree = await page.locator("body").ariaSnapshot();
  expect(accessibilityTree, route).toContain('navigation "Primary navigation"');
  expect(accessibilityTree, route).toContain("heading");
}

async function checkMatrix(page: Page, name: string, output: string) {
  for (const [width, height] of matrix) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    // Captures support a deliberate visual audit; normal runs need only the
    // semantic/geometry assertions, not hundreds of image artifacts.
    if (
      process.env.RESPONSIVE_CAPTURE === "true" ||
      process.env.RESPONSIVE_AUDIT
    ) {
      await page.screenshot({
        path: path.join(output, `${name}-${width}x${height}.png`),
        fullPage: true,
      });
    }
    const result = await geometry(page);
    if (process.env.RESPONSIVE_AUDIT)
      console.log(name, width, JSON.stringify(result));
    else
      expect(
        result.overflow,
        `${name} ${width}: ${result.offenders.join("; ")}`,
      ).toBeLessThanOrEqual(1);
    if (!process.env.RESPONSIVE_AUDIT) {
      const defects = await page.evaluate(() => {
        const visible = (el: Element) =>
          el.getBoundingClientRect().width > 1 &&
          getComputedStyle(el).visibility !== "hidden";
        const controls = [
          ...document.querySelectorAll<HTMLElement>(
            'button, input:not([type="hidden"]), select, textarea, a[href], summary',
          ),
        ].filter(visible);
        const failures: string[] = [];
        for (const el of controls) {
          if (el.tagName === "A" && getComputedStyle(el).display === "inline")
            continue;
          let target: Element = el;
          if (
            el instanceof HTMLInputElement &&
            ["radio", "checkbox"].includes(el.type)
          )
            target = el.labels?.[0] ?? el;
          const box = target.getBoundingClientRect();
          if (box.width < 43.9 || box.height < 43.9)
            failures.push(
              `Small target ${el.getAttribute("aria-label") ?? el.textContent?.slice(0, 35) ?? el.tagName}: ${box.width} × ${box.height}`,
            );
          if (
            el.matches(
              'input:not([type="radio"]):not([type="checkbox"]):not([type="range"]), select, textarea',
            ) &&
            parseFloat(getComputedStyle(el).fontSize) < 16
          )
            failures.push(`Small input text: ${el.getAttribute("name")}`);
          if (el.tagName === "BUTTON") {
            const next = el.nextElementSibling;
            if (next?.tagName === "BUTTON" && visible(next)) {
              const other = next.getBoundingClientRect();
              const gap =
                Math.abs(box.top - other.top) < 1
                  ? other.left - box.right
                  : other.top - box.bottom;
              if (gap < 7.9)
                failures.push(`Action gap: ${el.textContent} ${gap}`);
            }
          }
        }
        return failures;
      });
      expect(defects, `${name} ${width}`).toEqual([]);
    }
  }
}

test.use({ hasTouch: true });
for (const role of ["guest", "customer", "administrator"] as const) {
  test(`responsive exported routes: ${role}`, async ({ page }, info) => {
    test.setTimeout(120000);
    await fixtures(page, role);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    const accountStateRoutes = routes();
    for (const route of [...accountStateRoutes, "/404.html"]) {
      await page.goto(`${base}${route}`);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await page.waitForLoadState("networkidle");
      if (role === "guest") await checkDocumentStructure(page, route);
      if (role !== "guest")
        await expect(
          page.getByRole("link", { name: "Sign in", exact: true }),
        ).toHaveCount(0);
      await expect(page.getByText(/response was malformed/)).toHaveCount(0);
      await checkMatrix(
        page,
        `${role}-${route.replaceAll("/", "_")}`,
        info.outputDir,
      );
    }
    expect(errors).toEqual([]);
  });
}

test("responsive populated details and operational controls", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await fixtures(page, "administrator");
  for (const [name, route] of [
    ["project", `/projects/?project=${id}`],
    ["order", `/orders/?order=${orderId}`],
    ["return", `/checkout/return/?order=${orderId}`],
    [
      "sandbox",
      `/checkout/sandbox/?session=sc_demo_attempt_browser_00001&order=${orderId}`,
    ],
    ["public", "/configure/?design=AbCdEfGhIjKlMnOpQrStUv"],
    ["shared", `/configure/?share=${"H".repeat(43)}`],
    ["admin", "/admin/"],
  ]) {
    await page.goto(`${base}${route}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/response was malformed/)).toHaveCount(0);
    if (name === "shared")
      await expect(
        page.getByText(/Read-only project share restored/),
      ).toBeVisible();
    if (name === "public")
      await expect(page.getByText("Shared design restored.")).toBeVisible();
    if (name === "admin") {
      await page.getByRole("button", { name: "Review specification" }).click();
      await page.getByRole("button", { name: /SC-DEMO-WORK0001/ }).click();
      await page
        .getByText("Immutable production specification", { exact: true })
        .click();
      await page.getByRole("button", { name: "Run readiness checks" }).click();
    }
    await checkMatrix(page, name, info.outputDir);
  }
});

for (const state of ["empty", "error", "loading"]) {
  test(`responsive asynchronous states: ${state}`, async ({ page }, info) => {
    test.setTimeout(120000);
    const release = await fixtures(page, "administrator", state);
    for (const route of [
      "account",
      "projects",
      "commerce",
      "cart",
      "orders",
      "admin",
    ]) {
      await page.goto(`${base}/${route}/`);
      if (state !== "loading") await page.waitForLoadState("networkidle");
      else
        await expect(
          page
            .getByRole("status")
            .filter({ hasText: /Loading|Checking|Restoring/ })
            .first(),
        ).toBeVisible();
      await checkMatrix(page, `${state}-${route}`, info.outputDir);
    }
    release();
  });
}

test("responsive configurator stages and touch controls", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await fixtures(page, "customer");
  await page.goto(`${base}/configure/?design=AbCdEfGhIjKlMnOpQrStUv`);
  await expect(page.getByText("Shared design restored.")).toBeVisible();
  // Each stage chunk loads lazily behind a "Loading this configuration stage…"
  // fallback; wait for the stage's own h1 so captures never show the fallback.
  const stageHeadings = {
    Measurements: /^Measure your/,
    "Cover details": "Choose cover details",
    Pattern: "Choose a colour or pattern",
    Preview: /^Preview your/,
    Review: "SewnCovers configuration summary",
  };
  for (const [stage, heading] of Object.entries(stageHeadings)) {
    await page.getByRole("button", { name: `Continue to ${stage}` }).tap();
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
    await checkMatrix(page, stage, info.outputDir);
  }
});

test("touch navigation, form errors, table scrolling and forced-colors reflow", async ({
  page,
}, info) => {
  await fixtures(page, "guest");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${base}/account/`);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.tap();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await menu.press("Escape");
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Sign in", exact: true }).tap();
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await checkMatrix(page, "validation-forced-colors", info.outputDir);
  await page.getByRole("link", { name: "Create account", exact: true }).tap();
  const terms = page.getByRole("checkbox");
  await terms.check();
  await expect(terms).toBeChecked();
  await page.goto(`${base}/legal/`);
  await page.setViewportSize({ width: 320, height: 568 });
  const region = page.getByRole("region", {
    name: "Processing categories and retention",
  });
  await region.focus();
  await region.press("ArrowRight");
  await expect
    .poll(() => region.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  await expect(region).toBeFocused();
  expect(
    await region.evaluate((el) => getComputedStyle(el).outlineStyle),
  ).not.toBe("none");
  expect((await geometry(page)).overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('thead th[scope="col"]')).toHaveCount(3);
  // Payments, uploads, browser storage (the guest draft) and shipping.
  await expect(page.locator('tbody th[scope="row"]')).toHaveCount(4);
});

test("public content reflows with WCAG text-spacing overrides", async ({
  page,
}) => {
  await fixtures(page, "guest");
  await page.setViewportSize({ width: 320, height: 568 });

  for (const route of ["/", "/configure/", "/commerce/", "/legal/"]) {
    await page.goto(`${base}${route}`);
    await page.addStyleTag({
      content: `
        body { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
        p { margin-bottom: 2em !important; }
      `,
    });
    const result = await geometry(page);
    expect(
      result.overflow,
      `${route}: ${result.offenders.join("; ")}`,
    ).toBeLessThanOrEqual(1);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }
});
