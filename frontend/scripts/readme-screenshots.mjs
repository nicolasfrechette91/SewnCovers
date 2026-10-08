// Regenerates the README screenshots in <repo>/docs/images/.
//
//   npm run screenshots:readme                 build, serve, capture
//   npm run screenshots:readme -- --skip-build reuse the existing frontend/out
//
// It builds the static export the same way the browser tests do (placeholder
// API origin, domain-root site), serves it on 127.0.0.1:3100, drives a headless
// Chromium through the guest configurator with a fixed demonstration design,
// and writes compressed images. The real 15 seed patterns are answered from
// memory, so nothing ever leaves localhost: every other origin is blocked.
//
// This is a documentation tool. It is NOT part of `npm test`,
// `npm run test:e2e` or `npm run build`, and nothing imports it.

import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, expect as playwrightExpect } from "@playwright/test";

const frontendDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/images",
);
const nextCli = path.join(frontendDirectory, "node_modules/next/dist/bin/next");
const exportDirectory = path.join(frontendDirectory, "out");

const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://api.sewncovers.test";
const viewport = { height: 800, width: 1280 };
const navigationTimeout = 20_000;
const expect = playwrightExpect.configure({ timeout: navigationTimeout });

// The demonstration choice must really be the selected one.
const check = (radio) => expect(radio).toBeChecked();

const sizeBudget = { perImageBytes: 150 * 1024, totalBytes: 600 * 1024 };

// The exact catalogue the production API serves, from
// backend/migrations/versions/20260729_01_seed_canonical_patterns.py, with
// the names revision 20261007_02 gave four of them.
const patterns = [
  ["prototype-botanical", "Seed scatter", "Green and terracotta seeds scattered over a light ground.", "botanical", ["ivory", "green", "terracotta"], "prototype-pattern-botanical"],
  ["fern-trail", "Fern trail", "Layered fronds arranged along a gentle diagonal trail.", "botanical", ["ivory", "green"], "pattern-fern-trail"],
  ["meadow-sprig", "Meadow sprig", "Small branching sprigs scattered across an open ground.", "botanical", ["ivory", "blue", "gold"], "pattern-meadow-sprig"],
  ["prototype-geometric", "Harlequin", "Green and terracotta triangles in a bold harlequin check.", "geometric", ["ivory", "green", "terracotta"], "prototype-pattern-geometric"],
  ["diamond-path", "Diamond path", "Nested diamonds repeat in crisp offset rows.", "geometric", ["ivory", "blue", "charcoal"], "pattern-diamond-path"],
  ["arch-grid", "Arch grid", "Rounded arches alternate within a compact tiled grid.", "geometric", ["ivory", "terracotta", "gold"], "pattern-arch-grid"],
  ["harbor-stripe", "Harbour stripe", "Broad blue bands alternate with fine light pinstripes.", "striped", ["ivory", "blue"], "pattern-harbor-stripe"],
  ["orchard-stripe", "Orchard stripe", "Uneven green and gold lines form a relaxed rhythm.", "striped", ["ivory", "green", "gold"], "pattern-orchard-stripe"],
  ["ribbon-stripe", "Ribbon stripe", "Slim rose bands cross wider terracotta ribbons.", "striped", ["ivory", "terracotta", "rose"], "pattern-ribbon-stripe"],
  ["prototype-woven", "Fine weave", "A fine, quiet grid of crossing threads.", "woven", ["ivory", "charcoal"], "prototype-pattern-woven"],
  ["basket-check", "Basket check", "Alternating blocks suggest an oversized basket weave.", "woven", ["ivory", "blue", "charcoal"], "pattern-basket-check"],
  ["linen-crosshatch", "Linen crosshatch", "Fine crossing lines create a loose textured grid.", "woven", ["ivory", "gold"], "pattern-linen-crosshatch"],
  ["terrace-wave", "Terrace wave", "Layered waves move in alternating cool bands.", "abstract", ["ivory", "green", "blue"], "pattern-terrace-wave"],
  ["pebble-drift", "Pebble drift", "Soft-edged pebble forms gather in offset clusters.", "abstract", ["ivory", "terracotta", "charcoal"], "pattern-pebble-drift"],
  ["confetti-grid", "Confetti grid", "Playful dashes and dots repeat on a spacious grid.", "abstract", ["ivory", "green", "gold", "rose"], "pattern-confetti-grid"],
].map(([id, name, description, categoryId, colorIds, previewClassName]) => ({
  id,
  name,
  description,
  categoryId,
  colorIds,
  previewClassName,
}));

// Demonstration data only: a cushion that appears in the product's own
// examples. No account, no saved design, no personal data.
const design = {
  closure: "Zipper access",
  fit: "Standard fit",
  height: "50",
  material: "Cotton canvas",
  pattern: "Fern trail",
  seam: "Plain seam",
  shape: "Rectangle cushion",
  thickness: "10",
  width: "80",
};

// The file extension decides the format. Measured at 1280 px wide: flat
// screens (shape, pattern) are smallest as PNG, about 100-130 KB; the pages
// with the grid-paper background and the shaded cushion (home, preview,
// review) are 170-220 KB as PNG but about 100-120 KB as JPEG at this quality,
// with text still crisp. Re-deflating the PNGs at level 9 saves only ~2%.
const captures = {
  home: { file: "home.jpg" },
  pattern: { file: "pattern-step.png" },
  preview: { file: "preview-step.jpg" },
  review: { file: "review.jpg" },
  shape: { file: "shape-step.png" },
};
const jpegQuality = 80;

function log(message) {
  console.log(`[screenshots] ${message}`);
}

function runNextBuild() {
  // The browser tests build with a placeholder API origin and without the
  // GitHub Pages base path; the screenshots must match that site layout.
  const env = {
    ...process.env,
    NEXT_PUBLIC_API_URL: apiOrigin,
    SEWNCOVERS_E2E: "true",
  };
  delete env.SEWNCOVERS_GITHUB_PAGES;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextCli, "build"], {
      cwd: frontendDirectory,
      env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        reject(new Error(`next build stopped by ${signal}.`));
      } else if (code !== 0) {
        reject(new Error(`next build failed with exit code ${code}.`));
      } else {
        resolve();
      }
    });
  });
}

// --skip-build must not silently capture a production or GitHub Pages export.
async function assertExportIsHermetic() {
  const chunkDirectory = path.join(exportDirectory, "_next/static/chunks");
  let files;

  try {
    files = (await readdir(chunkDirectory)).filter((name) =>
      name.endsWith(".js"),
    );
  } catch {
    throw new Error(
      "frontend/out is missing. Run without --skip-build to build it first.",
    );
  }

  const contents = await Promise.all(
    files.map((name) => readFile(path.join(chunkDirectory, name), "utf8")),
  );

  if (!contents.some((text) => text.includes(apiOrigin))) {
    throw new Error(
      `frontend/out was not built for ${apiOrigin}. Run without --skip-build.`,
    );
  }

  const index = await readFile(path.join(exportDirectory, "index.html"), "utf8");

  if (index.includes("/SewnCovers/_next/")) {
    throw new Error(
      "frontend/out was built for GitHub Pages. Run without --skip-build.",
    );
  }
}

async function startServer() {
  // The static server reads the base path when it loads, so make sure a
  // GitHub Pages setting inherited from the shell cannot reach it.
  delete process.env.SEWNCOVERS_GITHUB_PAGES;
  const { startStaticServer } = await import("../e2e/static-server.mjs");

  return startStaticServer();
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

const corsHeaders = {
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-origin": appOrigin,
};

// Everything except the app itself and the in-memory API is refused.
async function isolateContext(context, problems) {
  await context.route(
    /^https?:\/\/(?!127\.0\.0\.1:3100(?:\/|$)|api\.sewncovers\.test(?:\/|$)).*/,
    async (route) => {
      problems.push(`blocked request to ${route.request().url()}`);
      await route.abort("blockedbyclient");
    },
  );

  await context.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const json = (body, status = 200) =>
      route.fulfill({
        body: JSON.stringify(body),
        headers: { ...corsHeaders, "content-type": "application/json" },
        status,
      });

    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
    } else if (request.method() === "GET" && pathname === "/health") {
      await json({ database: "healthy", process: "healthy" });
    } else if (request.method() === "GET" && pathname === "/patterns") {
      await json(patterns);
    } else if (request.method() === "GET" && pathname === "/uploads/availability") {
      // As in production: custom uploads are off.
      await json({ enabled: false });
    } else {
      problems.push(`unexpected API call ${request.method()} ${pathname}`);
      await json({ errors: [] }, 404);
    }
  });
}

// Text that would mean a transient or failed state ended up in a capture.
const transientText =
  /\bLoading\b|Connecting to|unavailable|could not be|couldn't be|No fabric shown yet|Picked up where/i;

async function settle(page, name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const active = document.activeElement;

    // No focus ring in the picture; focus has no effect on what is shown.
    if (active instanceof HTMLElement && active !== document.body) {
      active.blur();
    }
  });
  await page.waitForLoadState("networkidle");

  const state = await page.evaluate(() => ({
    overflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    text: document.querySelector("main")?.innerText ?? "",
  }));

  if (state.overflow > 0) {
    throw new Error(`${name}: the page scrolls horizontally by ${state.overflow}px.`);
  }

  const transient = state.text.match(transientText);

  if (transient !== null) {
    const context = state.text
      .slice(Math.max(0, transient.index - 40), transient.index + 60)
      .replace(/\s+/g, " ");

    throw new Error(`${name}: transient or error text on screen: "${context}".`);
  }
}

// Takes one picture of the current page.
//   scrollTo  locator placed `offset` px below the top edge (default: page top)
//   height    viewport height for this picture only (default: 800)
//   cropTo    locator whose bottom edge ends the picture (a shorter crop)
async function capture(
  page,
  name,
  { cropTo, height = viewport.height, offset = 24, scrollTo } = {},
) {
  await page.setViewportSize({ height, width: viewport.width });

  if (scrollTo) {
    await scrollTo.evaluate((element, margin) => {
      const top = element.getBoundingClientRect().top + window.scrollY - margin;

      window.scrollTo({ behavior: "instant", left: 0, top: Math.max(0, top) });
    }, offset);
  } else {
    await page.evaluate(() =>
      window.scrollTo({ behavior: "instant", left: 0, top: 0 }),
    );
  }

  await settle(page, name);

  let clip;

  if (cropTo) {
    const bottom = await cropTo.evaluate((element) =>
      Math.ceil(element.getBoundingClientRect().bottom),
    );

    clip = { height: bottom, width: viewport.width, x: 0, y: 0 };
  }

  const { file } = captures[name];
  const isJpeg = file.endsWith(".jpg");
  const buffer = await page.screenshot({
    animations: "disabled",
    caret: "hide",
    clip,
    quality: isJpeg ? jpegQuality : undefined,
    type: isJpeg ? "jpeg" : "png",
  });

  await page.setViewportSize(viewport);
  await writeFile(path.join(outputDirectory, file), buffer);

  return { bytes: buffer.length, file };
}

async function captureAll(browser) {
  const problems = [];
  const written = [];
  const context = await browser.newContext({
    colorScheme: "light",
    deviceScaleFactor: 1,
    locale: "en-US",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    viewport,
  });

  try {
    context.setDefaultTimeout(navigationTimeout);
    await isolateContext(context, problems);

    const page = await context.newPage();
    page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
    page.on("console", (message) => {
      const text = message.text();

      // The app's meta Content-Security-Policy always logs the first message
      // (a browser limitation of <meta> delivery); failed loads are reported
      // below with their URL.
      if (
        message.type() === "error" &&
        !text.includes("'frame-ancestors' is ignored") &&
        !text.startsWith("Failed to load resource")
      ) {
        problems.push(`console error: ${text}`);
      }
    });
    page.on("response", (response) => {
      // Next.js link prefetches (?_rsc=) 404 on the plain static server and
      // fall back to a normal navigation; they never reach the page.
      if (response.status() >= 400 && !response.url().includes("_rsc=")) {
        problems.push(`HTTP ${response.status()} for ${response.url()}`);
      }
    });
    page.on("requestfailed", (request) => {
      // Prefetches still in flight when a page is left or closed are aborted.
      if (request.failure()?.errorText !== "net::ERR_ABORTED") {
        problems.push(`failed request ${request.url()}`);
      }
    });

    // 1. Landing page.
    log("home");
    await page.goto(`${appOrigin}/`);
    await page
      .getByRole("heading", {
        level: 1,
        name: "Design a cover that fits the cushion you already have.",
      })
      .waitFor();
    // Cropped to end with the hero, before the next section starts.
    written.push(
      await capture(page, "home", {
        cropTo: page.getByRole("region", {
          name: "Design a cover that fits the cushion you already have.",
        }),
      }),
    );

    // 2. Shape stage, with the demonstration shape chosen.
    log("shape stage");
    await page.goto(`${appOrigin}/configure/`);
    await page
      .getByRole("heading", { level: 1, name: "Build your custom cover design." })
      .waitFor();
    await page.getByText(design.shape, { exact: true }).click();
    await check(page.getByRole("radio", { name: design.shape }));
    written.push(
      await capture(page, "shape", {
        height: 900,
        scrollTo: page.getByRole("navigation", { name: "Configuration progress" }),
      }),
    );

    // Measurements and cover details are walked through but not captured.
    log("measurements and cover details");
    await page.getByRole("button", { name: "Continue to Measurements" }).click();
    await page.getByRole("textbox", { name: "Width (cm)" }).fill(design.width);
    await page.getByRole("textbox", { name: "Height (cm)" }).fill(design.height);
    await page
      .getByRole("textbox", { name: "Thickness (cm)" })
      .fill(design.thickness);
    await page.getByRole("button", { name: "Continue to Cover details" }).click();
    for (const option of [
      design.material,
      design.fit,
      design.closure,
      design.seam,
    ]) {
      const radio = page.getByRole("radio", { name: option });

      await radio.check();
      await check(radio);
    }
    await page.getByRole("button", { name: "Continue to Pattern" }).click();

    // 3. Pattern stage, with the demonstration pattern chosen. The app moves
    // focus to each new stage; wait for that so it cannot scroll a capture.
    log("pattern stage");
    await expect(
      page.getByRole("heading", { level: 1, name: "Choose a colour or pattern" }),
    ).toBeFocused();
    await page.getByText("15 patterns", { exact: true }).waitFor();
    await page.getByText(design.pattern, { exact: true }).click();
    await check(page.getByRole("radio", { name: design.pattern }));
    written.push(
      await capture(page, "pattern", {
        height: 960,
        scrollTo: page.getByRole("heading", { exact: true, name: "Patterns" }),
      }),
    );

    // 4. Preview stage: the cushion drawn with the chosen pattern.
    log("preview stage");
    await page.getByRole("button", { name: "Continue to Preview" }).click();
    await expect(page.getByRole("slider", { name: "Pattern size" })).toBeFocused();
    await page.getByText("Fern trail on your rectangle cushion").first().waitFor();
    written.push(
      await capture(page, "preview", {
        scrollTo: page.getByRole("heading", {
          name: "Preview your rectangle cushion",
        }),
      }),
    );

    // 5. Review stage, from its title down.
    log("review stage");
    await page.getByRole("button", { name: "Continue to Review" }).click();
    const reviewTitle = page.getByRole("heading", {
      level: 1,
      name: "SewnCovers configuration summary",
    });
    await expect(reviewTitle).toBeFocused();
    await page.getByText("Fern trail on your rectangle cushion").waitFor();
    written.push(
      await capture(page, "review", {
        height: 900,
        offset: 72,
        scrollTo: reviewTitle,
      }),
    );
  } finally {
    await context.close();
  }

  if (problems.length > 0) {
    throw new Error(
      `The run was not clean:\n  - ${[...new Set(problems)].join("\n  - ")}`,
    );
  }

  return written;
}

function formatKilobytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function main() {
  const skipBuild = process.argv.includes("--skip-build");
  const startedAt = Date.now();

  if (skipBuild) {
    log("skipping the build; reusing frontend/out");
  } else {
    log("building the static export");
    await runNextBuild();
  }

  await assertExportIsHermetic();
  await mkdir(outputDirectory, { recursive: true });

  const server = await startServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const written = await captureAll(browser);
    const total = written.reduce((sum, item) => sum + item.bytes, 0);

    for (const { bytes, file } of written) {
      const warning = bytes > sizeBudget.perImageBytes ? "  (over the size budget)" : "";
      log(`${file.padEnd(18)} ${formatKilobytes(bytes).padStart(10)}${warning}`);
    }
    log(`${"total".padEnd(18)} ${formatKilobytes(total).padStart(10)}`);

    if (total > sizeBudget.totalBytes) {
      log("warning: the total is over the size budget");
    }
    log(`wrote ${written.length} images to ${outputDirectory}`);
    log(`done in ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
  } finally {
    await browser?.close();
    await closeServer(server);
  }
}

try {
  await main();
} catch (error) {
  console.error(`[screenshots] failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
