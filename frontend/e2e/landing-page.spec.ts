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

test("renders the hero action hierarchy and preserves its content", async ({
  page,
}) => {
  await page.goto(homePath);
  const hero = page.locator('section[aria-labelledby="landing-title"]');
  const actions = hero.locator(".landing-hero-actions").getByRole("link");

  await expect(actions).toHaveText([
    "Start configuring",
    "Explore cover examples",
    "See how the idea works",
  ]);
  const start = hero.getByRole("link", {
    name: "Start configuring",
    exact: true,
  });
  await expect(start).toHaveAttribute("href", configurePath);
  expect(await start.evaluate((element) => element.tagName)).toBe("A");
  await expect(
    hero.getByRole("link", { name: "Explore cover examples" }),
  ).toHaveAttribute("href", "#examples");
  await expect(
    hero.getByRole("link", { name: "See how the idea works" }),
  ).toHaveAttribute("href", "#how-it-works");
  await expect(page.locator("#examples")).toHaveCount(1);
  await expect(page.locator("#how-it-works")).toHaveCount(1);
  await expect(
    hero.getByRole("complementary", { name: "Prototype status" }),
  ).toContainText(
    "It cannot charge money, create a real shipment, or produce finished covers.",
  );
  await expect(
    hero.getByRole("link", { name: "View prototype details" }),
  ).toHaveAttribute("href", `${basePath}/trust/`);
  await expect(hero.locator("figure")).toBeVisible();
});

test("starts the unauthenticated configurator by pointer and keyboard at Shape", async ({
  page,
}) => {
  await page.goto(homePath);
  await page.getByRole("link", { name: "Start configuring" }).click();
  await expect(page).toHaveURL(`${appOrigin}${configurePath}`);
  await expect(
    page.getByRole("group", { name: "Choose your cushion shape" }),
  ).toBeVisible();
  await expect(page.locator('[aria-current="step"]')).toContainText("Shape");

  await page.goto(homePath);
  const start = page.getByRole("link", { name: "Start configuring" });
  await start.focus();
  await expect(start).toBeFocused();
  await start.press("Enter");
  await expect(page).toHaveURL(`${appOrigin}${configurePath}`);
  await expect(
    page.getByRole("group", { name: "Choose your cushion shape" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
});

test("keeps hero actions distinct, focused, and overflow-free", async ({ page }) => {
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

    const hero = page.locator('section[aria-labelledby="landing-title"]');
    const actionBoxes = await hero.locator(".landing-hero-actions").getByRole("link").evaluateAll((links) =>
      links.map((link) => {
        const rect = link.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
        };
      }),
    );

    expect(actionBoxes).toHaveLength(3);
    for (const box of actionBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(viewport.width);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    for (let first = 0; first < actionBoxes.length; first += 1) {
      for (let second = first + 1; second < actionBoxes.length; second += 1) {
        const a = actionBoxes[first];
        const b = actionBoxes[second];
        const overlaps =
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        expect(overlaps).toBe(false);
      }
    }
  }

  const hero = page.locator('section[aria-labelledby="landing-title"]');
  const start = hero.getByRole("link", { name: "Start configuring" });
  const examples = hero.getByRole("link", { name: "Explore cover examples" });
  const visualHierarchy = await Promise.all(
    [start, examples].map((action) =>
      action.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          backgroundColor: styles.backgroundColor,
          borderColor: styles.borderColor,
          boxShadow: styles.boxShadow,
        };
      }),
    ),
  );
  expect(visualHierarchy[0].backgroundColor).not.toBe(
    visualHierarchy[1].backgroundColor,
  );
  expect(visualHierarchy[0].borderColor).not.toBe(
    visualHierarchy[1].borderColor,
  );

  await start.focus();
  await expect(start).toBeFocused();
  await expect
    .poll(() => start.evaluate((element) => getComputedStyle(element).boxShadow))
    .not.toBe("none");

  await page.emulateMedia({ forcedColors: "active" });
  await start.focus();
  await expect
    .poll(() => start.evaluate((element) => getComputedStyle(element).outlineStyle))
    .not.toBe("none");
});

test("keeps example cards aligned and intentionally responsive", async ({ page }) => {
  for (const expectation of [
    { columns: 1, viewport: { width: 390, height: 844 } },
    { columns: 2, viewport: { width: 768, height: 1024 } },
    { columns: 3, viewport: { width: 1440, height: 900 } },
  ]) {
    await page.setViewportSize(expectation.viewport);
    await page.goto(homePath);

    const cards = page.locator(".landing-example-card");
    const boxes = await cards.evaluateAll((figures) =>
      figures.map((figure) => {
        const media = figure.querySelector<HTMLElement>(
          ".landing-example-media",
        );
        const illustration = figure.querySelector<HTMLElement>(
          ".landing-example-illustration",
        );
        if (!media || !illustration) {
          throw new Error("Example card structure is incomplete.");
        }

        const cardBox = figure.getBoundingClientRect();
        const mediaBox = media.getBoundingClientRect();
        const illustrationBox = illustration.getBoundingClientRect();
        return {
          cardBottom: cardBox.bottom,
          cardHeight: cardBox.height,
          cardTop: cardBox.top,
          illustrationBottom: illustrationBox.bottom,
          illustrationLeft: illustrationBox.left,
          illustrationRight: illustrationBox.right,
          illustrationTop: illustrationBox.top,
          mediaBottom: mediaBox.bottom,
          mediaLeft: mediaBox.left,
          mediaRight: mediaBox.right,
          mediaTop: mediaBox.top,
        };
      }),
    );

    expect(boxes).toHaveLength(3);
    const rowTops = [...new Set(boxes.map((box) => Math.round(box.cardTop)))];
    expect(rowTops).toHaveLength(
      Math.ceil(boxes.length / expectation.columns),
    );

    for (const rowTop of rowTops) {
      const row = boxes.filter(
        (box) => Math.abs(Math.round(box.cardTop) - rowTop) <= 1,
      );
      expect(Math.max(...row.map((box) => box.cardHeight))).toBeCloseTo(
        Math.min(...row.map((box) => box.cardHeight)),
        0,
      );
      expect(Math.max(...row.map((box) => box.mediaBottom))).toBeCloseTo(
        Math.min(...row.map((box) => box.mediaBottom)),
        0,
      );
    }

    for (const box of boxes) {
      expect(box.illustrationTop).toBeGreaterThan(box.mediaTop);
      expect(box.illustrationBottom).toBeLessThan(box.mediaBottom);
      expect(box.illustrationLeft).toBeGreaterThan(box.mediaLeft);
      expect(box.illustrationRight).toBeLessThan(box.mediaRight);
    }
  }
});
