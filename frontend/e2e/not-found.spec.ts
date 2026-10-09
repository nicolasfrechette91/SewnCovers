import { expect, test } from "@playwright/test";

const basePath =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";

// GitHub Pages serves 404.html for any unknown path; the local static server
// answers unknown paths with an empty 404, so open the exported page itself.
test("the 404 page is themed and links home and to the configurator under the base path", async ({
  page,
}) => {
  await page.goto(`${basePath}/404.html`);

  await expect(page).toHaveTitle("Page not found | SewnCovers");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { level: 1, name: "This page doesn't exist." }),
  ).toBeVisible();
  await expect(
    page.getByText("The link may be mistyped or out of date."),
  ).toBeVisible();
  const main = page.getByRole("main");
  await expect(
    main.getByRole("link", { name: "Design a cover" }),
  ).toHaveAttribute("href", `${basePath}/configure/`);
  await expect(
    main.getByRole("link", { name: "Go to the home page" }),
  ).toHaveAttribute("href", `${basePath}/`);
  // The footer's prototype line is the page's one statement.
  await expect(page.getByText(/prototype/i)).toHaveCount(1);

  await main.getByRole("link", { name: "Design a cover" }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Build your custom cover design.",
    }),
  ).toBeVisible();
});
