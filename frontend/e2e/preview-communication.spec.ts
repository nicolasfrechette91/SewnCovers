import { expect, test } from "@playwright/test";
const base = process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
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

test("preview stays synchronized through contextual edits and accessible at all widths", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    let webglContexts = 0;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value(this: HTMLCanvasElement, type: string, ...arguments_: unknown[]) {
        if (type === "webgl" || type === "webgl2") webglContexts += 1;
        return Reflect.apply(original, this, [type, ...arguments_]);
      },
    });
    Object.defineProperty(window, "__sewncoversWebglContexts", { get: () => webglContexts });
  });
  const scriptRequests: string[] = [];
  page.on("request", request => {
    if (request.resourceType() === "script") scriptRequests.push(request.url());
  });
  let requests = 0;
  await page.route("http://api.sewncovers.test/**", async route => {
    const headers = { "access-control-allow-origin": "http://127.0.0.1:3100", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, OPTIONS", "content-type": "application/json" };
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    const isPatterns = new URL(route.request().url()).pathname === "/patterns";
    if (isPatterns) requests++;
    await route.fulfill({ status: isPatterns ? 200 : 404, headers, body: JSON.stringify(isPatterns ? patterns : { errors: [] }) });
  });
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const next = async (name: string) => { await button(`Continue to ${name}`).click(); };
  await page.goto(`${base}/configure/`);
  await page.getByRole("radio", { name: "Rectangle cushion" }).press("Space");
  await next("Measurements");
  for (const [name, value] of [["Width", "80"], ["Height", "40"], ["Thickness", "10"]]) await page.getByRole("textbox", { name: `${name} (cm)` }).fill(value);
  await next("Cover details"); await next("Pattern");
  await page.getByRole("radio", { name: "Fern trail", exact: true }).press("Space");
  await next("Preview");
  const figure = page.getByRole("figure", { name: "Cushion preview" });
  const slider = page.getByRole("slider", { name: "Pattern size" });
  await expect(slider).toHaveValue("1");
  const before = requests;
  for (const [key, value] of [["End", "2"], ["Home", "0.5"], ["ArrowRight", "0.6"]]) { await slider.press(key); await expect(slider).toHaveValue(value); }
  await expect(figure.locator(".cushion-preview-face")).toHaveCSS("--pattern-scale", "0.6");
  expect(requests).toBe(before);
  await button("Back to Pattern").click(); await next("Preview");
  await expect(slider).toHaveValue("0.6");
  await button("Change pattern").click();
  await expect(page.getByText("Choose a pattern", { exact: true })).toBeFocused();
  await page.getByRole("radio", { name: "Diamond path", exact: true }).press("Space");
  await next("Preview");
  await expect(figure.locator(".pattern-diamond-path")).toBeVisible();
  await button("Edit cover details").click();
  await expect(page.getByRole("heading", { name: "Choose cover details" })).toBeFocused();
  await page.getByRole("radio", { name: "More relaxed fit" }).press("Space");
  await next("Pattern"); await next("Preview");
  await expect(figure).toContainText("rounder corners");
  await button("Edit measurements").click();
  await expect(page.getByText("Measure your rectangle cushion", { exact: true })).toBeFocused();
  await page.getByRole("textbox", { name: "Width (cm)" }).fill("90");
  await next("Cover details"); await next("Pattern"); await next("Preview");
  await expect(figure).toContainText("90 cm"); await expect(figure).toContainText("Diamond path"); await expect(slider).toHaveValue("0.6");
  for (const width of [320, 375, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(slider).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect((await slider.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await figure.screenshot({ path: testInfo.outputPath(`preview-${width}.png`) });
  }
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(slider).toBeVisible();
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue("0.7");
  await figure.screenshot({ path: testInfo.outputPath("preview-forced-colors.png") });
  expect(await page.evaluate(() => (window as unknown as { __sewncoversWebglContexts: number }).__sewncoversWebglContexts)).toBe(0);
  const scriptsBefore3d = scriptRequests.length;
  await button("Load approximate 3D preview").click();
  await expect(page.getByText(/This 3D view uses a generic texture/)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __sewncoversWebglContexts: number }).__sewncoversWebglContexts)).toBe(1);
  expect(scriptRequests.length).toBe(scriptsBefore3d + 1);
  await expect(figure.getByText(/not a manufacturing specification/)).toBeVisible();
});


