import { expect, test, type Page } from "@playwright/test";

const appOrigin = "http://127.0.0.1:3100";
const basePath =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const productionSite = "https://nicolasfrechette91.github.io/SewnCovers";
const socialImage = `${productionSite}/social-preview.jpg`;

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test("exports canonical and social metadata for every indexable route", async ({
  page,
}) => {
  const routes = [
    ["/", "SewnCovers | Cushion-cover design prototype"],
    ["/configure/", "Configure a cushion | SewnCovers"],
    ["/commerce/", "Prototype pricing | SewnCovers"],
    ["/trust/", "Trust and implementation boundaries | SewnCovers"],
    ["/legal/", "Legal and consent information | SewnCovers"],
    ["/case-study/", "Case study | SewnCovers"],
  ] as const;

  for (const [route, title] of routes) {
    await page.goto(`${basePath}${route}`);
    await expect(page).toHaveTitle(title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /.+/,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "index, follow",
    );
    const canonical =
      route === "/" ? `${productionSite}/` : `${productionSite}${route}`;
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      canonical,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      title,
    );
    await expect(
      page.locator('meta[property="og:description"]'),
    ).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      canonical,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      socialImage,
    );
    await expect(
      page.locator('meta[property="og:image:width"]'),
    ).toHaveAttribute("content", "1200");
    await expect(
      page.locator('meta[property="og:image:height"]'),
    ).toHaveAttribute("content", "630");
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    expect(canonical).not.toContain("localhost");
    expect(canonical).toContain("/SewnCovers/");
  }

  const imageResponse = await page.request.get(`${basePath}/social-preview.jpg`);
  expect(imageResponse.status()).toBe(200);
  expect(imageResponse.headers()["content-type"]).toBe("image/jpeg");
  expect(Number(imageResponse.headers()["content-length"])).toBeLessThan(500_000);
});

test("keeps account, operational, transaction, and 404 contexts out of search", async ({
  page,
}) => {
  for (const route of [
    "/account/?mode=register&returnTo=pricing",
    "/projects/",
    "/cart/",
    "/orders/",
    "/admin/",
    "/checkout/sandbox/?quote=private",
    "/checkout/return/?order=private&session=private",
    "/checkout/cancel/?return=private",
  ]) {
    await page.goto(`${basePath}${route}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow, nocache",
    );
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    expect(canonical).not.toContain("?");
    expect(canonical).not.toContain("#");
    expect(canonical).not.toContain("private");
  }

  await page.route("http://api.sewncovers.test/**", (route) => route.abort());
  await page.goto(`${basePath}/configure/?share=${"S".repeat(43)}`);
  const privateRobots = page.locator('meta[name="robots"]');
  await expect(privateRobots.first()).toHaveAttribute(
    "content",
    "noindex, nofollow, nocache",
  );
  expect(
    await privateRobots.evaluateAll((elements) =>
      elements.every(
        (element) =>
          element.getAttribute("content") === "noindex, nofollow, nocache",
      ),
    ),
  ).toBe(true);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${productionSite}/configure/`,
  );
  await page.goto(`${basePath}/configure/?design=${"D".repeat(22)}`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "index, follow",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${productionSite}/configure/`,
  );

  await page.goto(`${basePath}/404.html`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test("presents the case study without entering primary customer navigation", async ({
  page,
}) => {
  for (const viewport of [
    { height: 568, width: 320 },
    { height: 667, width: 375 },
    { height: 1024, width: 768 },
    { height: 900, width: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${basePath}/case-study/`);
    await expectNoOverflow(page);
    await expect(
      page.getByRole("heading", { level: 1, name: /A measured path/ }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Explore the work" })).toBeVisible();
  }

  const primary = page.getByRole("list", { name: "Primary destinations" });
  await expect(primary.getByRole("link")).toHaveText([
    "Configure",
    "My projects",
    "Pricing",
  ]);
  await expect(primary.getByRole("link", { name: "Case study" })).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Footer navigation" }).getByRole("link", {
      name: "Case study",
    }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /View source repository/ })).toHaveAttribute(
    "href",
    "https://github.com/nicolasfrechette91/SewnCovers",
  );

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.reload();
  await page.getByRole("link", { name: "Explore the configurator" }).focus();
  await expect(page.getByRole("link", { name: "Explore the configurator" })).toBeFocused();
  await expectNoOverflow(page);

  const sitemapResponse = await page.request.get(`${basePath}/sitemap.xml`);
  expect(sitemapResponse.status()).toBe(200);
  expect(sitemapResponse.headers()["content-type"]).toContain("application/xml");
  const sitemap = await sitemapResponse.text();
  expect(sitemap).toContain(`${productionSite}/case-study/`);
  expect(sitemap).not.toMatch(/account|admin|checkout|projects|orders|cart/i);

  const robotsResponse = await page.request.get(`${basePath}/robots.txt`);
  expect(robotsResponse.status()).toBe(200);
  expect(await robotsResponse.text()).toContain(
    `Sitemap: ${productionSite}/sitemap.xml`,
  );
  expect(page.url()).toBe(`${appOrigin}${basePath}/case-study/`);
});
