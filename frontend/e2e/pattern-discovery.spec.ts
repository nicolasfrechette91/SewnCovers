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
  process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const configurePath = `${basePath}/configure/`;
const publicId = "PatternDiscoveryDemo01";

const patternRecords = [
  ["prototype-botanical", "Botanical sample", "An organic, leaf-inspired prototype direction.", "botanical", ["ivory", "green", "terracotta"]],
  ["fern-trail", "Fern trail", "Layered fronds arranged along a gentle diagonal trail.", "botanical", ["ivory", "green"]],
  ["meadow-sprig", "Meadow sprig", "Small branching sprigs scattered across an open ground.", "botanical", ["ivory", "blue", "gold"]],
  ["prototype-geometric", "Geometric sample", "A warm, structured prototype direction.", "geometric", ["ivory", "green", "terracotta"]],
  ["diamond-path", "Diamond path", "Nested diamonds repeat in crisp offset rows.", "geometric", ["ivory", "blue", "charcoal"]],
  ["arch-grid", "Arch grid", "Rounded arches alternate within a compact tiled grid.", "geometric", ["ivory", "terracotta", "gold"]],
  ["harbor-stripe", "Harbor stripe", "Broad blue bands alternate with fine light pinstripes.", "striped", ["ivory", "blue"]],
  ["orchard-stripe", "Orchard stripe", "Uneven green and gold lines form a relaxed rhythm.", "striped", ["ivory", "green", "gold"]],
  ["ribbon-stripe", "Ribbon stripe", "Slim rose bands cross wider terracotta ribbons.", "striped", ["ivory", "terracotta", "rose"]],
  ["prototype-woven", "Woven sample", "A quiet, small-scale prototype direction.", "woven", ["ivory", "charcoal"]],
  ["basket-check", "Basket check", "Alternating blocks suggest an oversized basket weave.", "woven", ["ivory", "blue", "charcoal"]],
  ["linen-crosshatch", "Linen crosshatch", "Fine crossing lines create a loose textured grid.", "woven", ["ivory", "gold"]],
  ["terrace-wave", "Terrace wave", "Layered waves move in alternating cool bands.", "abstract", ["ivory", "green", "blue"]],
  ["pebble-drift", "Pebble drift", "Soft-edged pebble forms gather in offset clusters.", "abstract", ["ivory", "terracotta", "charcoal"]],
  ["confetti-grid", "Confetti grid", "Playful dashes and dots repeat on a spacious grid.", "abstract", ["ivory", "green", "gold", "rose"]],
] as const;

const patterns = patternRecords.map(
  ([id, name, description, categoryId, colorIds]) => ({
    id,
    name,
    description,
    categoryId,
    colorIds,
    previewClassName: `api-${id}`,
  }),
);

const savedDesign = Object.freeze({
  shape: "rectangle",
  width: 80,
  height: 40,
  backWidth: null,
  thickness: 10,
  unit: "cm",
  patternId: "terrace-wave",
  patternScale: 1.2,
  materialId: "cotton-canvas",
  fitPreference: "standard",
  closureType: "zipper",
  seamStyle: "plain",
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

async function mockApi(context: BrowserContext, patternQueries: string[]) {
  await context.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
      return;
    }

    if (request.method() === "GET" && url.pathname === "/patterns") {
      patternQueries.push(url.search);
      const category = url.searchParams.get("category");
      const color = url.searchParams.get("color");
      await fulfillJson(
        route,
        patterns.filter(
          (pattern) =>
            (category === null || pattern.categoryId === category) &&
            (color === null ||
              pattern.colorIds.some((colorId) => colorId === color)),
        ),
      );
      return;
    }

    if (
      request.method() === "GET" &&
      url.pathname === `/designs/${publicId}`
    ) {
      await fulfillJson(route, { ...savedDesign, publicId });
      return;
    }

    await fulfillJson(route, { errors: [] }, 404);
  });
}

async function reachPatternStage(page: Page) {
  await page
    .getByRole("button", { name: "Continue to Measurements" })
    .click();
  await page
    .getByRole("button", { name: "Continue to Cover details" })
    .click();
  await page.getByRole("button", { name: "Continue to Pattern" }).click();
  await expect(
    page.getByRole("searchbox", { name: "Search built-in patterns" }),
  ).toBeVisible();
}

test("discovers built-in patterns progressively without losing selection", async ({
  context,
  page,
}) => {
  const patternQueries: string[] = [];
  const mediaRequests: string[] = [];
  page.on("request", (request) => {
    if (["image", "media"].includes(request.resourceType())) {
      mediaRequests.push(request.url());
    }
  });
  await mockApi(context, patternQueries);
  await page.goto(`${configurePath}?design=${publicId}`);
  await expect(
    page.getByRole("status").filter({ hasText: "Shared design restored." }),
  ).toBeVisible();
  await reachPatternStage(page);

  await expect(page.locator(".pattern-card-input")).toHaveCount(7);
  await expect(page.getByText("Showing 6 of 15 patterns.")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Selected pattern outside the initial results",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to Preview" }),
  ).toBeEnabled();
  await expect(page.getByRole("region", { name: "Your patterns" })).toBeVisible();
  const initialMediaRequests = [...mediaRequests];

  const search = page.getByRole("searchbox", {
    name: "Search built-in patterns",
  });
  await search.fill("  TERRACE  ");
  await expect(page.locator(".pattern-card-input")).toHaveCount(2);
  await expect(page.getByRole("radio", { name: "Terrace wave" })).toBeChecked();
  expect(mediaRequests).toEqual(initialMediaRequests);
  await expect(
    page.locator('[id$="-result-count"]'),
  ).toHaveText("1 of 15 patterns match. Showing all matches.");

  await search.fill("cool bands");
  await expect(page.getByRole("radio", { name: "Terrace wave" })).toBeVisible();
  await search.fill("woven");
  await expect(page.locator(".pattern-card-input")).toHaveCount(4);
  await search.fill("rose");
  await expect(page.locator(".pattern-card-input")).toHaveCount(3);
  await search.fill("");

  await page
    .getByRole("group", { name: "Filter by category" })
    .getByText("Geometric", { exact: true })
    .click();
  await expect(page.locator(".pattern-card-input")).toHaveCount(4);
  await page
    .getByRole("group", { name: "Filter by color" })
    .getByText("Blue", { exact: true })
    .click();
  await expect(page.locator(".pattern-card-input")).toHaveCount(2);
  await search.fill("nested");
  await expect(page.getByRole("radio", { name: "Diamond path" })).toBeVisible();
  await expect(
    page.locator('p:not([role="status"])', {
      hasText: "1 of 15 patterns match. Showing all matches.",
    }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Clear search and filters", exact: true })
    .first()
    .click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("radio", { name: "All categories" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "All colors" })).toBeChecked();
  await expect(page.locator(".pattern-card-input")).toHaveCount(7);

  const showAll = page.getByRole("button", {
    name: "Show all 15 patterns (9 more)",
  });
  await showAll.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".pattern-card-input")).toHaveCount(16);
  await expect(page.getByRole("button", { name: "Show fewer patterns" })).toBeFocused();
  await expect(page.getByRole("radio", { name: "Terrace wave" })).toBeChecked();

  await page.getByRole("radio", { name: "Pebble drift" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: "Pebble drift" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Terrace wave" })).not.toBeChecked();

  await search.fill("does not exist");
  await expect(
    page.getByRole("heading", {
      name: "No patterns match your search and filters",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Selected pattern hidden by discovery criteria",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to Preview" }),
  ).toBeEnabled();

  await page
    .getByRole("button", { name: "Clear search and filters", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Back to Cover details" }).click();
  await page.getByRole("button", { name: "Continue to Pattern" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Selected pattern outside the initial results",
    }),
  ).toBeVisible();
  await expect(page.getByText(/Pebble drift remains selected/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to Preview" }),
  ).toBeEnabled();

  expect(patternQueries).toEqual([""]);
});

test("keeps Continue validation and native selection semantics", async ({
  context,
  page,
}) => {
  await mockApi(context, []);
  await page.goto(configurePath);
  await page.getByText("Square cushion", { exact: true }).click();
  await page
    .getByRole("button", { name: "Continue to Measurements" })
    .click();
  await page.getByRole("textbox", { name: "Width (cm)" }).fill("50");
  await page.getByRole("textbox", { name: "Thickness (cm)" }).fill("10");
  await page
    .getByRole("button", { name: "Continue to Cover details" })
    .click();
  await page.getByRole("button", { name: "Continue to Pattern" }).click();

  const continueButton = page.getByRole("button", {
    name: "Continue to Preview",
  });
  await expect(continueButton).toBeDisabled();
  await page.getByRole("radio", { name: "Fern trail" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: "Fern trail" })).toBeChecked();
  await expect(continueButton).toBeEnabled();

  await page.getByRole("button", { name: "Back to Cover details" }).click();
  await page.getByRole("button", { name: "Continue to Pattern" }).click();
  await expect(page.getByRole("radio", { name: "Fern trail" })).toBeChecked();
  await page.getByText("Diamond path", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Diamond path" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Fern trail" })).not.toBeChecked();
});

test("selects, edits, previews, and preserves a solid fabric color", async ({
  context,
  page,
}) => {
  await mockApi(context, []);
  await page.goto(configurePath);
  expect(new URL(page.url()).pathname).toBe(configurePath);
  await page.getByText("Square cushion", { exact: true }).click();
  await page
    .getByRole("button", { name: "Continue to Measurements" })
    .click();
  await page.getByRole("textbox", { name: "Width (cm)" }).fill("50");
  await page.getByRole("textbox", { name: "Thickness (cm)" }).fill("10");
  await page
    .getByRole("button", { name: "Continue to Cover details" })
    .click();
  await page.getByRole("button", { name: "Continue to Pattern" }).click();

  const solid = page.getByRole("radio", { name: "Solid color" });
  await expect(solid).toBeVisible();
  await expect(page.locator(".pattern-card-input").first()).toHaveAttribute(
    "value",
    "solid-color",
  );
  const search = page.getByRole("searchbox", {
    name: "Search built-in patterns",
  });
  await search.fill("no printed pattern matches this");
  await expect(solid).toBeVisible();
  await solid.focus();
  await page.keyboard.press("Space");
  await expect(solid).toBeChecked();
  await expect(
    page.getByRole("heading", { name: "Choose your fabric color" }),
  ).toBeVisible();

  const hex = page.getByRole("textbox", { name: "Hexadecimal color" });
  await expect(hex).toHaveValue("#B8AFA3");
  await hex.fill("#12");
  await expect(
    page.getByRole("alert").filter({
      hasText: "six-digit hexadecimal color",
    }),
  ).toBeVisible();
  await hex.fill("f5f2eb");
  await expect(hex).toHaveValue("#F5F2EB");
  await expect(page.getByText("Live cushion preview · Solid color #F5F2EB"))
    .toBeVisible();
  await expect(page.locator('svg[data-fabric-kind="solid"]')).toBeVisible();

  const nativePicker = page.getByLabel("Fabric color picker");
  await nativePicker.fill("#111827");
  await expect(hex).toHaveValue("#111827");
  await expect(page.getByText("Live cushion preview · Solid color #111827"))
    .toBeVisible();

  await page.getByRole("button", { name: "Continue to Preview" }).click();
  await expect(page.locator('svg[data-fabric-kind="solid"]')).toBeVisible();
  await expect(page.getByText(/Solid color · #111827/)).toBeVisible();
  await page.getByRole("button", { name: "Back to Pattern" }).click();
  await expect(solid).toBeChecked();
  await expect(hex).toHaveValue("#111827");

  await search.fill("");
  await page.getByRole("radio", { name: "Fern trail" }).focus();
  await page.keyboard.press("Space");
  await expect(solid).not.toBeChecked();
  await solid.focus();
  await page.keyboard.press("Space");
  await expect(hex).toHaveValue("#111827");
});
