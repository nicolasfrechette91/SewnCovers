import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";

import { expectStageFocused } from "./support/keyboard";

// Every API call is answered here, so nothing depends on the real hosted API
// waking up.
const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://api.sewncovers.test";
const probePath = "/__test-probe";
const warmupSessionKey = "sewncovers:api-warmup";
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

    if (path === probePath) {
      await fulfillJson(route, {});
      return;
    }

    requests.push(path);

    if (path === "/health") {
      await (
        handlers.health ??
        ((r) => fulfillJson(r, { database: "healthy", process: "healthy" }))
      )(route);
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

async function openConfigure(page: Page) {
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Configure" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Build your custom cover design." }),
  ).toBeVisible();
}

async function openConfigureFromHome(page: Page) {
  await page.goto(`${basePath}/`);
  await openConfigure(page);
}

// While the clock is stopped nothing moves focus, so a stage that is visible is
// as ready as one that is focused.
async function reachPatternStep(page: Page, { clockStopped = false } = {}) {
  await page.getByText("Box / bench cushion", { exact: true }).click();
  await page.getByRole("button", { name: "Continue to Measurements" }).click();
  if (clockStopped) {
    await expect(
      page.getByRole("heading", { level: 1, name: /^Measure your / }),
    ).toBeVisible();
  } else {
    await expectStageFocused(page, "Measurements");
  }
  await page.getByRole("textbox", { name: "Width (cm)" }).fill("72.25");
  await page.getByRole("textbox", { name: "Depth (cm)" }).fill("48.5");
  await page.getByRole("textbox", { name: "Thickness (cm)" }).fill("12.75");
  await page.getByRole("button", { name: "Continue to Cover details" }).click();
  await page.getByRole("button", { name: "Continue to Pattern" }).click();
  await expect(
    page.getByRole("heading", { name: "Patterns", exact: true }),
  ).toBeVisible();
}

interface IdleHold {
  count(): number;
  release(): void;
}

// The warm-up starts in an idle callback, and the browser decides when the page
// is idle. A test that needs the warm-up to begin at a known moment holds idle
// callbacks from the start, as a busy page would, and releases them itself.
async function holdIdleCallbacks(page: Page) {
  await page.addInitScript(() => {
    let nextHandle = 1;
    const held = new Map<number, IdleRequestCallback>();

    window.requestIdleCallback = (callback) => {
      held.set(nextHandle, callback);
      return nextHandle++;
    };
    window.cancelIdleCallback = (handle) => {
      held.delete(handle);
    };
    const hold: IdleHold = {
      count: () => held.size,
      release: () => {
        const deadline = { didTimeout: false, timeRemaining: () => 0 };
        const callbacks = [...held.values()];

        held.clear();
        callbacks.forEach((callback) => callback(deadline));
      },
    };
    Object.assign(window, { idleHold: hold });
  });

  return {
    /** Resolves once the page has asked for an idle period. */
    asked: () =>
      page.waitForFunction(
        () =>
          (window as unknown as { idleHold: IdleHold }).idleHold.count() > 0,
      ),
    release: () =>
      page.evaluate(() =>
        (window as unknown as { idleHold: IdleHold }).idleHold.release(),
      ),
  };
}

// Stops the timers the app arms from here on. Install the clock only after the
// page has loaded: React captured its own timers at load, so lazy stages still
// appear in real time, while the app's calls to `setTimeout` (the two-second
// "waking up" notice, the retry delay, the request time limit) wait until the
// test runs the clock. Resume it when the test no longer cares about those.
async function freezeClock(page: Page) {
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1_000);
}

// The warm-up is scheduled by an effect after hydration and decides in the
// next idle period whether to ping. Rather than sleeping, wait for hydration,
// then for an idle callback registered after the warm-up's own, then send a
// probe through the mocked API: anything the warm-up sent reached the mock
// before the probe's response comes back.
async function settleWarmup(page: Page) {
  await page.waitForFunction(() =>
    Object.keys(document.body).some((key) => key.startsWith("__reactFiber$")),
  );
  await page.evaluate(
    async ({ origin, path }) => {
      for (let period = 0; period < 2; period += 1) {
        await new Promise<void>((resolve) =>
          window.requestIdleCallback(() => resolve(), { timeout: 3_000 }),
        );
      }
      await fetch(`${origin}${path}`);
    },
    { origin: apiOrigin, path: probePath },
  );
}

const builtInPatternsReady = (page: Page) =>
  page.getByText("15 patterns", { exact: true }).first();
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
  await settleWarmup(page);
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

  // "Connecting" gives way to the waking-up message two seconds after the
  // warm-up's request starts, whatever the visitor is doing. So the warm-up
  // starts only once the clock is stopped, and the whole walk to the Pattern
  // step happens inside those two seconds, however slow this machine is.
  const idle = await holdIdleCallbacks(page);
  await page.goto(`${basePath}/`);
  await idle.asked();
  await freezeClock(page);
  await idle.release();
  await expect.poll(() => api.count("/health"), { timeout: 15_000 }).toBe(1);

  await openConfigure(page);
  await reachPatternStep(page, { clockStopped: true });
  await expect(
    page.getByRole("status").filter({ hasText: "Connecting" }),
  ).toBeVisible();
  expect(api.count("/patterns")).toBe(0);

  releaseHealth();
  await page.clock.resume();
  await expect(builtInPatternsReady(page)).toBeVisible();
  expect(api.count("/health")).toBe(1);
  expect(api.count("/patterns")).toBe(1);
});

test("keeps the waking-up fallback when the warm-up fails and the API is slow", async ({
  context,
  page,
}) => {
  // The retry stays in flight until the test has seen it there.
  let releaseRetry!: () => void;
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  const api = await mockApi(context, {
    health: (route) => fulfillJson(route, { errors: [] }, 404),
    patterns: async (route, call) => {
      if (call === 1) {
        await fulfillJson(route, { errors: [] }, 503);
        return;
      }
      await retryGate;
      await fulfillJson(route, patterns);
    },
  });
  const wakingUpNotice = page.getByText(
    "The SewnCovers API may be waking up. Retrying (1 of 2)…",
  );

  await page.goto(`${basePath}/`);
  await expect.poll(() => api.count("/health"), { timeout: 15_000 }).toBe(1);
  await expect(unavailableNotice(page)).toHaveCount(0);

  // The pattern request fails with 503 as the visitor arrives and is retried
  // after a short delay. Stop the clock so the delay, and the time limit on
  // the retry, pass only when the test says.
  await freezeClock(page);
  await openConfigure(page);
  await reachPatternStep(page, { clockStopped: true });
  await expect(wakingUpNotice).toBeVisible();
  expect(api.count("/patterns")).toBe(1);

  // A second is longer than the first retry delay and far shorter than the
  // time limit on a request.
  await page.clock.runFor(1_000);
  await expect.poll(() => api.count("/patterns")).toBe(2);
  await expect(wakingUpNotice).toBeVisible();
  await expect(builtInPatternsReady(page)).toHaveCount(0);

  releaseRetry();
  await page.clock.resume();
  await expect(builtInPatternsReady(page)).toBeVisible();
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
  await settleWarmup(page);
  // The warm-up writes this flag before it sends anything.
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), warmupSessionKey),
  ).toBeNull();
  expect(api.requests).toEqual([]);
});
