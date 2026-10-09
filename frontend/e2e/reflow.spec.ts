import { expect, test, type Page } from "@playwright/test";

import { base, fixtures, id, orderId, routes } from "./support/api-fixtures";

// WCAG 1.4.10 Reflow: content works at 320 CSS px wide without scrolling
// sideways, which is what 400 percent zoom does to a 1280 px window. The
// viewport is the one that criterion names (320 x 256, the same zoom applied
// to 1280 x 1024). Tables and the like may scroll inside their own region.
const viewport = { height: 256, width: 320 };
const publicId = "AbCdEfGhIjKlMnOpQrStUv";

/**
 * No sideways page scroll, and nothing drawn beyond the right or left edge of
 * the viewport. A table or code block that scrolls inside its own container
 * (the criterion allows two-dimensional content) and an input scrolling its
 * own text are not the page overflowing.
 */
async function expectReflow(page: Page, where: string) {
  const { outside, overflow } = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const insideOwnScroller = (element: Element) => {
      for (
        let node = element.parentElement;
        node && node !== document.body;
        node = node.parentElement
      ) {
        if (
          ["auto", "hidden", "scroll"].includes(
            getComputedStyle(node).overflowX,
          )
        )
          return true;
      }
      return false;
    };
    const outside = Array.from(
      document.querySelectorAll<HTMLElement>("main *, header *, footer *"),
    )
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.width > 0 &&
          (box.right > width + 1 || box.left < -1) &&
          getComputedStyle(element).position !== "absolute" &&
          !insideOwnScroller(element)
        );
      })
      .slice(0, 8)
      .map(
        (element) =>
          `${element.tagName} ${element.textContent?.slice(0, 60)} (${Math.round(element.getBoundingClientRect().left)}..${Math.round(element.getBoundingClientRect().right)} of ${width})`,
      );
    return { outside, overflow: document.documentElement.scrollWidth - width };
  });
  expect(overflow, `${where}: the page scrolls sideways`).toBeLessThanOrEqual(
    1,
  );
  expect(outside, `${where}: content beyond the viewport`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(viewport);
});

for (const role of ["guest", "customer", "administrator"] as const) {
  test(`every route reflows at 320 CSS px: ${role}`, async ({ page }) => {
    test.setTimeout(120_000);
    await fixtures(page, role);

    for (const route of [...routes(), "/404.html"]) {
      await page.goto(`${base}${route}`);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await page.waitForLoadState("networkidle");
      await expectReflow(page, `${role} ${route}`);
    }
  });
}

test("detail and operational states reflow at 320 CSS px", async ({ page }) => {
  test.setTimeout(120_000);
  await fixtures(page, "administrator");

  for (const [name, route] of [
    ["project", `/projects/?project=${id}`],
    ["order", `/orders/?order=${orderId}`],
    ["checkout return", `/checkout/return/?order=${orderId}`],
    [
      "sandbox checkout",
      `/checkout/sandbox/?session=sc_demo_attempt_browser_00001&order=${orderId}`,
    ],
    ["admin", "/admin/"],
  ]) {
    await page.goto(`${base}${route}`);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await page.waitForLoadState("networkidle");
    if (name === "admin") {
      await page.getByRole("button", { name: "Review specification" }).click();
      await page.getByRole("button", { name: /SC-DEMO-WORK0001/ }).click();
      await page.getByRole("button", { name: "Run readiness checks" }).click();
    }
    await expectReflow(page, name);
  }
});

test("every configurator stage reflows at 320 CSS px", async ({ page }) => {
  test.setTimeout(120_000);
  await fixtures(page, "guest");

  await page.goto(`${base}/configure/`);
  await expect(
    page.getByRole("heading", { name: "Choose your cushion shape" }),
  ).toBeVisible();
  await expectReflow(page, "shape stage");

  await page.goto(`${base}/configure/?design=${publicId}`);
  await expect(page.getByText("Shared design restored.")).toBeVisible();
  await expectReflow(page, "shape stage, design restored");

  // The shape-change question is the widest thing the first stage can show.
  await page.getByText("Square cushion", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Use the same width and height?" }),
  ).toBeVisible();
  await expectReflow(page, "shape change question");
  await page.keyboard.press("Escape");

  for (const stage of [
    "Measurements",
    "Cover details",
    "Pattern",
    "Preview",
    "Review",
  ]) {
    await page.getByRole("button", { name: `Continue to ${stage}` }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expectReflow(page, `${stage} stage`);
  }
});
