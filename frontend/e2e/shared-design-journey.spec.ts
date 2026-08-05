import { expect, test, type Route } from "@playwright/test";

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

const patterns = patternRecords.map(
  ([id, name, categoryId, colorIds]) => ({
    id,
    name,
    description: `Mocked ${name.toLowerCase()} direction.`,
    categoryId,
    colorIds,
    previewClassName: `api-${id}`,
  }),
);

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

async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200,
) {
  await route.fulfill({
    body: JSON.stringify(body),
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
    status,
  });
}

test("restores the exact shared design after a duplicate-safe save", async ({
  context,
  page,
}) => {
  let releaseSave!: () => void;
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const requests = {
    designGets: 0,
    patternGets: 0,
    posts: 0,
  };
  const unexpectedRequests: string[] = [];
  let postedDesign: unknown;

  await context.route(
    /^https?:\/\/(?!127\.0\.0\.1:3100(?:\/|$)|api\.sewncovers\.test(?:\/|$)).*/,
    async (route) => {
      unexpectedRequests.push(route.request().url());
      await route.abort("blockedbyclient");
    },
  );

  await context.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
      return;
    }

    if (request.method() === "GET" && url.pathname === "/patterns") {
      requests.patternGets += 1;
      await fulfillJson(route, patterns);
      return;
    }

    if (request.method() === "POST" && url.pathname === "/designs") {
      requests.posts += 1;
      postedDesign = request.postDataJSON();
      await saveGate;
      await fulfillJson(route, { ...savedDesign, publicId }, 201);
      return;
    }

    if (
      request.method() === "GET" &&
      url.pathname === `/designs/${publicId}`
    ) {
      requests.designGets += 1;
      await fulfillJson(route, { ...savedDesign, publicId });
      return;
    }

    unexpectedRequests.push(`${request.method()} ${request.url()}`);
    await fulfillJson(route, { errors: [] }, 404);
  });

  await test.step("select shape and enter exact measurements", async () => {
    await page.goto(configurePath);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Choose your cushion's shape, measurements, and pattern.",
      }),
    ).toBeVisible();

    await page.getByText("Box / bench cushion", { exact: true }).click();
    await expect(
      page.getByRole("radio", { name: "Box / bench cushion" }),
    ).toBeChecked();

    await page.getByRole("textbox", { name: "Width (cm)" }).fill("72.25");
    await page.getByRole("textbox", { name: "Depth (cm)" }).fill("48.5");
    await page
      .getByRole("textbox", { name: "Thickness (cm)" })
      .fill("12.75");
    await expect(
      page.getByRole("radio", { name: "Centimetres (cm)" }),
    ).toBeChecked();
    await expect(page.getByText("Showing all 12 patterns.")).toBeVisible();
  });

  await test.step("select a pattern and verify the live preview", async () => {
    await page.getByText("Fern trail", { exact: true }).click();
    await expect(
      page.getByRole("radio", { name: "Fern trail" }),
    ).toBeChecked();

    const scale = page.getByRole("slider", { name: "Pattern size" });
    await scale.fill("1.3");
    await expect(scale).toHaveValue("1.3");
    await expect(scale).toHaveAttribute("aria-valuetext", "1.3× pattern size");

    const preview = page.getByRole("region", {
      name: "Box / bench cushion preview",
    });
    await expect(preview).toContainText("Current proportional preview");
    await expect(preview).toContainText("Fern trail");
    await expect(preview).toContainText("72.25 cm");
    await expect(preview).toContainText("48.5 cm");
    await expect(preview).toContainText("12.75 cm");
    await expect(preview).toContainText("1.3×");
  });

  await test.step("review accessible, user-visible values", async () => {
    await page.getByRole("button", { name: "Review configuration" }).click();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "SewnCovers configuration summary",
      }),
    ).toBeFocused();

    const summary = page.getByRole("region", {
      exact: true,
      name: "Configuration summary",
    });
    await expect(summary).toContainText("Box / bench");
    await expect(summary).toContainText("72.25 cm");
    await expect(summary).toContainText("48.5 cm");
    await expect(summary).toContainText("12.75 cm");
    await expect(summary).toContainText("Fern trail");
    await expect(summary).toContainText("1.3×");
  });

  await test.step("save once under duplicate activation and create the link", async () => {
    const saveButton = page.getByRole("button", {
      name: "Save and create share link",
    });

    await saveButton.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });

    await expect.poll(() => requests.posts).toBe(1);
    try {
      await expect(
        page.getByRole("button", { name: /Saving design/ }),
      ).toBeDisabled();
      expect(postedDesign).toEqual(savedDesign);
    } finally {
      releaseSave();
    }
    await expect(
      page.getByRole("status").filter({
        hasText: "Design saved. Your share link is ready.",
      }),
    ).toBeVisible();

    const expectedShareUrl = `${appOrigin}${configurePath}?design=${publicId}`;
    const shareUrl = page.getByRole("textbox", { name: "Share URL" });
    await expect(shareUrl).toHaveValue(expectedShareUrl);
    await expect(
      page.getByRole("button", { name: "Save and create share link" }),
    ).toHaveCount(0);
    expect(requests.posts).toBe(1);
  });

  await test.step("open the share link and restore every exact value", async () => {
    const expectedShareUrl = `${appOrigin}${configurePath}?design=${publicId}`;
    const restoredPage = await context.newPage();
    await restoredPage.goto(expectedShareUrl);

    await expect(
      restoredPage.getByRole("status").filter({
        hasText:
          "Shared design restored. You can keep configuring it without saving a new copy.",
      }),
    ).toBeVisible();
    await expect(
      restoredPage.getByRole("radio", { name: "Box / bench cushion" }),
    ).toBeChecked();
    await expect(
      restoredPage.getByRole("textbox", { name: "Width (cm)" }),
    ).toHaveValue("72.25");
    await expect(
      restoredPage.getByRole("textbox", { name: "Depth (cm)" }),
    ).toHaveValue("48.5");
    await expect(
      restoredPage.getByRole("textbox", { name: "Thickness (cm)" }),
    ).toHaveValue("12.75");
    await expect(
      restoredPage.getByRole("radio", { name: "Centimetres (cm)" }),
    ).toBeChecked();
    await expect(
      restoredPage.getByRole("radio", { name: "Fern trail" }),
    ).toBeChecked();
    await expect(
      restoredPage.getByRole("slider", { name: "Pattern size" }),
    ).toHaveValue("1.3");

    const restoredPreview = restoredPage.getByRole("region", {
      name: "Box / bench cushion preview",
    });
    await expect(restoredPreview).toContainText("Current proportional preview");
    await expect(restoredPreview).toContainText("Fern trail");
    await expect(restoredPreview).toContainText("72.25 cm");
    await expect(restoredPreview).toContainText("48.5 cm");
    await expect(restoredPreview).toContainText("12.75 cm");
    await expect(restoredPreview).toContainText("1.3×");

    await expect(
      restoredPage.getByRole("button", { name: "Review configuration" }),
    ).toBeEnabled();

    await restoredPage.reload();
    await expect(
      restoredPage.getByRole("status").filter({
        hasText:
          "Shared design restored. You can keep configuring it without saving a new copy.",
      }),
    ).toBeVisible();
    await expect(
      restoredPage.getByRole("textbox", { name: "Width (cm)" }),
    ).toHaveValue("72.25");

    await restoredPage
      .getByRole("link", { name: "SewnCovers home" })
      .click();
    await expect(restoredPage).toHaveURL(`${appOrigin}${basePath}/`);
  });

  expect(requests).toEqual({
    designGets: 2,
    patternGets: 3,
    posts: 1,
  });
  expect(unexpectedRequests).toEqual([]);
});
