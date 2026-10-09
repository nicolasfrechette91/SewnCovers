import { expect, test, type Page } from "@playwright/test";

const appOrigin = "http://127.0.0.1:3100";
const basePath =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const homePath = `${basePath}/`;
const configurePath = `${basePath}/configure/`;

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));

  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
}

function heroOf(page: Page) {
  return page.locator('section[aria-labelledby="landing-title"]');
}

test("leads with one action and states the prototype notice once", async ({
  page,
}) => {
  await page.goto(homePath);
  const hero = heroOf(page);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Design a cover that fits the cushion you already have.",
  );
  await expect(hero.getByRole("link")).toHaveText(["Start configuring"]);
  const start = hero.getByRole("link", {
    name: "Start configuring",
    exact: true,
  });
  await expect(start).toHaveAttribute("href", configurePath);
  expect(await start.evaluate((element) => element.tagName)).toBe("A");

  // Every action in main moves forward to the configurator; none loops back.
  expect(
    await page
      .getByRole("main")
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
  ).toEqual([configurePath, configurePath]);

  await expect(
    page.getByRole("region", { name: "How it works" }).locator("li p"),
  ).toHaveText([
    "Pick the shape that matches your cushion.",
    "Enter its measurements, with a diagram to guide you.",
    "Choose fabric and a pattern, then preview, save or share.",
  ]);
  await expect(
    page
      .getByRole("region", { name: "Five cushion shapes" })
      .getByRole("listitem"),
  ).toHaveText([
    "Square",
    "Rectangle",
    "Box / bench",
    "Round",
    "Tapered / trapezoid",
  ]);

  await expect(page.getByRole("complementary")).toHaveCount(1);
  await expect(
    page.getByRole("complementary", { name: "Prototype" }),
  ).toContainText(
    "It cannot charge money, create a real shipment, or produce finished covers.",
  );
  const textOutsideNotice = await page.evaluate(() => {
    const notice = document.querySelector<HTMLElement>("aside");
    if (!notice) throw new Error("The prototype notice is missing.");
    notice.style.display = "none";
    const text = document.body.innerText;
    notice.style.removeProperty("display");
    return text;
  });
  expect(textOutsideNotice).not.toMatch(/prototype|demo|illustrative/i);

  // Pages without their own notice keep the footer's prototype line.
  await page.goto(configurePath);
  await expect(page.getByRole("contentinfo")).toContainText(
    "A portfolio prototype for custom cushion covers.",
  );
});

test("starts the unauthenticated configurator by pointer and keyboard at Shape", async ({
  page,
}) => {
  await page.goto(homePath);
  await heroOf(page).getByRole("link", { name: "Start configuring" }).click();
  await expect(page).toHaveURL(`${appOrigin}${configurePath}`);
  await expect(
    page.getByRole("group", { name: "Choose your cushion shape" }),
  ).toBeVisible();
  await expect(page.locator('[aria-current="step"]')).toContainText("Shape");

  await page.goto(homePath);
  const start = heroOf(page).getByRole("link", { name: "Start configuring" });
  await start.focus();
  await expect(start).toBeFocused();
  await start.press("Enter");
  await expect(page).toHaveURL(`${appOrigin}${configurePath}`);
  await expect(
    page.getByRole("group", { name: "Choose your cushion shape" }),
  ).toBeVisible();
  // Guests are never prompted to sign in while designing; the header keeps
  // one quiet, optional link.
  await expect(
    page.getByRole("main").getByRole("link", { name: /sign in/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("button", { name: /sign in/i }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: /sign in/i }),
  ).toHaveCount(1);

  await page.goto(homePath);
  await page
    .getByRole("region", { name: "Ready with a tape measure?" })
    .getByRole("link", { name: "Start configuring" })
    .click();
  await expect(page).toHaveURL(`${appOrigin}${configurePath}`);
});

test("keeps both actions reachable, focused, and overflow-free", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(homePath);
    await expectNoHorizontalOverflow(page);

    const actionBoxes = await page
      .getByRole("main")
      .getByRole("link", { name: "Start configuring" })
      .evaluateAll((links) =>
        links.map((link) => {
          const rect = link.getBoundingClientRect();
          return {
            bottom: rect.bottom,
            height: rect.height,
            left: rect.left,
            right: rect.right,
          };
        }),
      );

    expect(actionBoxes).toHaveLength(2);
    for (const box of actionBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(viewport.width);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    // The hero's action is visible without scrolling.
    expect(actionBoxes[0].bottom).toBeLessThanOrEqual(viewport.height);
  }

  const start = heroOf(page).getByRole("link", { name: "Start configuring" });
  await start.focus();
  await expect(start).toBeFocused();
  await expect
    .poll(() =>
      start.evaluate((element) => getComputedStyle(element).boxShadow),
    )
    .not.toBe("none");

  await page.emulateMedia({ forcedColors: "active" });
  await start.focus();
  await expect
    .poll(() =>
      start.evaluate((element) => getComputedStyle(element).outlineStyle),
    )
    .not.toBe("none");
});

test("lays out the five shapes evenly at every width", async ({ page }) => {
  for (const expectation of [
    { rows: [1, 1, 1, 1, 1], viewport: { width: 390, height: 844 } },
    { rows: [3, 2], viewport: { width: 768, height: 1024 } },
    { rows: [5], viewport: { width: 1440, height: 900 } },
  ]) {
    await page.setViewportSize(expectation.viewport);
    await page.goto(homePath);

    const tiles = page
      .getByRole("region", { name: "Five cushion shapes" })
      .getByRole("listitem");
    await expect(tiles).toHaveCount(5);
    const boxes = await tiles.evaluateAll((items) =>
      items.map((item) => {
        const icon = item.querySelector("svg.shape-illustration");
        if (!icon || !item.parentElement) {
          throw new Error("Shape tile structure is incomplete.");
        }
        const tile = item.getBoundingClientRect();
        const iconBox = icon.getBoundingClientRect();
        const list = item.parentElement.getBoundingClientRect();
        return {
          bottom: tile.bottom,
          height: tile.height,
          iconBottom: iconBox.bottom,
          iconLeft: iconBox.left,
          iconRight: iconBox.right,
          iconTop: iconBox.top,
          left: tile.left,
          listLeft: list.left,
          listRight: list.right,
          right: tile.right,
          top: tile.top,
        };
      }),
    );

    const rowTops = [...new Set(boxes.map((box) => Math.round(box.top)))];
    const rows = rowTops.map((rowTop) =>
      boxes.filter((box) => Math.abs(Math.round(box.top) - rowTop) <= 1),
    );
    expect(rows.map((row) => row.length)).toEqual(expectation.rows);

    for (const row of rows) {
      expect(Math.max(...row.map((box) => box.height))).toBeCloseTo(
        Math.min(...row.map((box) => box.height)),
        0,
      );
      // A short last row sits centred under the full one.
      const leftGap = row[0].left - row[0].listLeft;
      const rightGap = row[0].listRight - row[row.length - 1].right;
      expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1);
    }

    for (const box of boxes) {
      expect(box.iconTop).toBeGreaterThan(box.top);
      expect(box.iconBottom).toBeLessThan(box.bottom);
      expect(box.iconLeft).toBeGreaterThan(box.left);
      expect(box.iconRight).toBeLessThan(box.right);
    }
  }
});
