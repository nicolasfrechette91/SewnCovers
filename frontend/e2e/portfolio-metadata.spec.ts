import { expect, test } from "@playwright/test";

const basePath =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const productionSite = "https://nicolasfrechette91.github.io/SewnCovers";
const socialImage = `${productionSite}/social-preview.jpg`;

test("exports canonical and social metadata for every indexable route", async ({
  page,
}) => {
  const routes = [
    ["/", "SewnCovers | Cushion-cover design prototype"],
    ["/configure/", "Configure a cushion | SewnCovers"],
    ["/commerce/", "Prototype pricing | SewnCovers"],
    ["/legal/", "Legal information | SewnCovers"],
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
