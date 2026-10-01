import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";

// Every API call is answered here, so nothing depends on the real hosted API
// waking up.
const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://api.sewncovers.test";
const basePath =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";

const patternRecords = [
  ["prototype-botanical", "botanical", ["ivory", "green", "terracotta"]],
  ["fern-trail", "botanical", ["ivory", "green"]],
  ["meadow-sprig", "botanical", ["ivory", "blue", "gold"]],
  ["prototype-geometric", "geometric", ["ivory", "green", "terracotta"]],
  ["diamond-path", "geometric", ["ivory", "blue", "charcoal"]],
  ["arch-grid", "geometric", ["ivory", "terracotta", "gold"]],
  ["harbor-stripe", "striped", ["ivory", "blue"]],
  ["orchard-stripe", "striped", ["ivory", "green", "gold"]],
  ["ribbon-stripe", "striped", ["ivory", "terracotta", "rose"]],
  ["prototype-woven", "woven", ["ivory", "charcoal"]],
  ["basket-check", "woven", ["ivory", "blue", "charcoal"]],
  ["linen-crosshatch", "woven", ["ivory", "gold"]],
  ["terrace-wave", "abstract", ["ivory", "green", "blue"]],
  ["pebble-drift", "abstract", ["ivory", "terracotta", "charcoal"]],
  ["confetti-grid", "abstract", ["ivory", "green", "gold", "rose"]],
] as const;

const patterns = patternRecords.map(([id, categoryId, colorIds]) => ({
  categoryId,
  colorIds,
  description: `Description for ${id}.`,
  id,
  name: id.replaceAll("-", " "),
  previewClassName: `api-${id}`,
}));

const corsHeaders = {
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-origin": appOrigin,
};

interface ApiMock {
  readonly requests: string[];
  count(path: string): number;
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    headers: { ...corsHeaders, "content-type": "application/json" },
    status,
  });
}

async function mockApi(
  context: BrowserContext,
  handlers: {
    health?: (route: Route) => Promise<void>;
    patterns?: (route: Route, call: number) => Promise<void>;
  } = {},
): Promise<ApiMock> {
  const requests: string[] = [];
  let patternCalls = 0;

  await context.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
      return;
    }

    requests.push(path);

    if (path === "/health") {
      await (handlers.health ??
        ((r) => fulfillJson(r, { database: "healthy", process: "healthy" })))(
        route,
      );
    } else if (path === "/patterns") {
      patternCalls += 1;
      await (handlers.patterns ?? ((r) => fulfillJson(r, patterns)))(
        route,
        patternCalls,
      );
    } else {
      await fulfillJson(route, { errors: [] }, 404);
    }
  });

  return {
    count: (path) => requests.filter((entry) => entry === path).length,
    requests,
  };
}

async function openConfigureFromHome(page: Page) {
  await page.goto(`${basePath}/`);
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Configure" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Build your custom cover design." }),
  ).toBeVisible();
}

async function reachPatternStep(page: Page) {
  await page.getByText("Box / bench cushion", { exact: true }).click();
  await page.getByRole("button", { name: "Continue to Measurements" }).click();
  await page.getByRole("textbox", { name: "Width (cm)" }).fill("72.25");
  await page.getByRole("textbox", { name: "Depth (cm)" }).fill("48.5");
  await page.getByRole("textbox", { name: "Thickness (cm)" }).fill("12.75");
  await page.getByRole("button", { name: "Continue to Cover details" }).click();
  await page.getByRole("button", { name: "Continue to Pattern" }).click();
  await expect(
    page.getByRole("heading", { name: "Built-in patterns" }),
  ).toBeVisible();
}

const builtInPatternsReady = (page: Page) =>
  page.getByText("Showing 6 of 15 patterns.").first();
const unavailableNotice = (page: Page) =>
  page.getByText(/catalogue unavailable|could not be reached/i);

test("wakes the API once per session and the Pattern step renders the prefetched list", async ({
  context,
  page,
}) => {
  const api = await mockApi(context);

  await openConfigureFromHome(page);
  await expect.poll(() => api.count("/health"), { timeout: 15_000 }).toBe(1);
  await expect.poll(() => api.count("/patterns"), { timeout: 15_000 }).toBe(1);

  await reachPatternStep(page);
  await expect(builtInPatternsReady(page)).toBeVisible();
  await expect(page.getByText(/may be waking up/i)).toHaveCount(0);
  expect(api.count("/patterns")).toBe(1);
  await expect(unavailableNotice(page)).toHaveCount(0);

  // The same tab session never pings again; the page loads its own list.
  await page.reload();
  await expect.poll(() => api.count("/patterns"), { timeout: 15_000 }).toBe(2);
  await page.waitForTimeout(500);
  expect(api.count("/health")).toBe(1);
});

test("a visitor reaching the Pattern step mid warm-up reuses the in-flight request", async ({
  context,
  page,
}) => {
  let releaseHealth!: () => void;
  const healthGate = new Promise<void>((resolve) => {
    releaseHealth = resolve;
  });
  const api = await mockApi(context, {
    health: async (route) => {
      await healthGate;
      await fulfillJson(route, { database: "healthy", process: "healthy" });
    },
  });

  await openConfigureFromHome(page);
  await expect.poll(() => api.count("/health"), { timeout: 15_000 }).toBe(1);
  await reachPatternStep(page);
  await expect(page.getByRole("status").filter({ hasText: "Connecting" })).toBeVisible();
  expect(api.count("/patterns")).toBe(0);

  releaseHealth();
  await expect(builtInPatternsReady(page)).toBeVisible();
  expect(api.count("/health")).toBe(1);
  expect(api.count("/patterns")).toBe(1);
});

test("keeps the waking-up fallback when the warm-up fails and the API is slow", async ({
  context,
  page,
}) => {
  const api = await mockApi(context, {
    health: (route) => fulfillJson(route, { errors: [] }, 404),
    patterns: async (route, call) => {
      if (call === 1) {
        await fulfillJson(route, { errors: [] }, 503);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      await fulfillJson(route, patterns);
    },
  });

  await openConfigureFromHome(page);
  await expect.poll(() => api.count("/health"), { timeout: 15_000 }).toBe(1);
  await expect(unavailableNotice(page)).toHaveCount(0);

  await reachPatternStep(page);
  await expect(
    page.getByText("The SewnCovers API may be waking up. Retrying (1 of 2)…"),
  ).toBeVisible();
  await expect(builtInPatternsReady(page)).toBeVisible({ timeout: 15_000 });
});

test("skips the warm-up entirely when the browser asks to save data", async ({
  context,
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
  });
  const api = await mockApi(context);

  await page.goto(`${basePath}/`);
  await page.waitForTimeout(4_500);
  expect(api.requests).toEqual([]);
});
