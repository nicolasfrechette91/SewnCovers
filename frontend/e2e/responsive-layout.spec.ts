import { expect, test, type Page } from "@playwright/test";
import { readdirSync } from "node:fs";
import path from "node:path";

const base = process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const api = "http://api.sewncovers.test";
const matrix = [[320, 568], [375, 667], [390, 844], [430, 932], [667, 375], [768, 1024], [1024, 768], [1440, 900], [512, 384]];
const id = "P".repeat(22), versionId = "V".repeat(22), orderId = "O".repeat(22);
const long = "FictionalPatio".repeat(9);
const date = "2026-08-28T12:00:00Z";
const configuration = { shape: "box", width: 73.25, height: 49.75, backWidth: null, thickness: 13.5, unit: "cm", pattern: { kind: "built-in", patternId: "terrace-wave" }, patternScale: 1.6, materialId: "linen-blend", fitPreference: "relaxed", closureType: "envelope", seamStyle: "piped" };
const version = { id: versionId, versionNumber: 1, configuration, createdAt: date, isCurrent: true };
const project = { id, name: long, versionCount: 1, updatedAt: date, privacy: "private", createdAt: date, currentVersion: version, activeShares: [] };
const quote = { id: "Q".repeat(22), demonstration: true, status: "active", modelLabel: "Demonstration CAD price model v1", priceBookVersion: 1, currency: "CAD", quantity: 1, unitAmountMinor: 10450, subtotalAmountMinor: 10450, subtotalFormatted: "$104.50 CAD", breakdown: [], taxTreatment: "Fictional tax.", shippingTreatment: "Fictional shipping.", projectVersionId: versionId, configuration, createdAt: date, expiresAt: date, canCheckout: true, customAsset: null };
const order = { id: orderId, reference: "SC-DEMO-ORDER0001", demonstration: true, createdAt: date, state: "paid", paymentStatus: "paid", currency: "CAD", subtotalAmountMinor: 10450, taxAmountMinor: 1515, shippingAmountMinor: 1200, totalAmountMinor: 13165, totalFormatted: "$131.65 CAD", lines: [{ quoteId: quote.id, quantity: 1, extendedAmountMinor: 10450, configuration, productionSpecification: { shape: "box", measurements: { width: "73.25", height: "49.75", thickness: "13.5", unit: "cm" }, material: "linen-blend", fit: "relaxed", configurationVersionReference: versionId, quoteReference: quote.id } }], shipment: { carrier: "canada-post", trackingReference: "DEMOTRACK".repeat(4), trackingUrl: null, shippedAt: date, deliveredAt: null }, shippingAddress: null, timeline: [{ action: "payment_verified", fromState: "payment_pending", toState: "paid", data: {}, createdAt: date }] };
const work = { id: "W".repeat(22), orderReference: "SC-DEMO-WORK0001", lineIndex: 0, state: "review", qualityState: "pending", revision: 1, specification: { shape: "box", checksum: "a".repeat(64), measurements: { width: "80", unit: "cm" } }, checklist: [{ itemKey: "specification_review", status: "pending" }], issues: [], history: [{ action: "created", toState: "review", createdAt: date }], demonstration: true };

// Same isolated records and response shapes as the existing commerce/account/
// assurance journeys, with long labels; no real account or commerce service.
async function fixtures(page: Page, role: "guest" | "customer" | "administrator", state = "populated") {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  if (role !== "guest") await page.addInitScript(() => sessionStorage.setItem("sewncovers.session-token", "A".repeat(43)));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:3100(?:\/|$)|api\.sewncovers\.test(?:\/|$)).*/, route => route.abort());
  await page.route(`${api}/**`, async route => {
    const url = new URL(route.request().url());
    const headers = { "access-control-allow-origin": "http://127.0.0.1:3100", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS", "content-type": "application/json" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ headers, status: 204 });
    const p = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ headers, status, body: JSON.stringify(body) });
    if (state === "loading") await pending;
    if (p === "/account") return json({ email: `${long}@example.invalid`, createdAt: date, role });
    if (p === "/account/sessions") return json([{ id: 1, createdAt: date, expiresAt: new Date(Date.now() + 3600000).toISOString(), current: true, revokedAt: null }]);
    if (state === "error") return json({ errors: [{ code: "service_unavailable", message: `Fictional service unavailable. Reference ${"X".repeat(100)}`, location: ["service"] }] }, 503);
    const empty = state === "empty";
    if (p === "/projects") return json(empty ? [] : [project]);
    if (p === `/projects/${id}`) return json(project);
    if (p === `/projects/${id}/versions`) return json([version]);
    if (p === "/commerce/quotes") return json(empty ? [] : [quote]);
    if (p === "/commerce/pricing/preview") return json(quote);
    if (p === "/commerce/cart") return json({ id, demonstration: true, state: "active", currency: "CAD", lines: empty ? [] : [{ id, quote, quantity: 1, extendedAmountMinor: 10450 }], subtotalAmountMinor: empty ? 0 : 10450, subtotalFormatted: empty ? "$0.00 CAD" : "$104.50 CAD", notices: [] });
    if (p === "/commerce/orders" || p === "/admin/orders") return json(empty ? [] : [order]);
    if (p === `/commerce/orders/${orderId}` || p === `/admin/orders/${orderId}`) return json(order);
    if (p.startsWith("/commerce/sandbox/checkouts/")) return json({ demonstration: true, sessionId: "sc_demo_attempt_browser_00001", orderReference: order.reference, amountMinor: 10450, currency: "CAD", status: "pending", expiresAt: date });
    if (p === "/admin/price-books") return json(empty ? [] : [{ id, version: 1, label: long, state: "draft", currency: "CAD", configuration: { model: "demonstration-price-v1" }, effectiveAt: null, publishedAt: null, createdAt: date }]);
    if (p === "/admin/audit") return json(empty ? [] : [{ id: 1, action: "order.transition", targetType: "order", targetId: orderId, actorAccountId: "A".repeat(22), data: {}, createdAt: date }]);
    if (p === "/admin/production-work") return json({ items: empty ? [] : [work], page: 1, pageSize: 20, total: empty ? 0 : 1 });
    if (p === "/admin/analytics/aggregates") return json({ demonstration: true, fixtureBacked: true, timezone: "UTC", suppressionThreshold: 3, freshness: date, items: [{ eventType: "visualization_fallback", count: null, suppressed: true }], limitations: ["Fictional fixture only."], consentScope: "Affirmative optional consent only." });
    if (p === "/uploads") return json([]);
    if (p === "/readiness") return json({ ready: false, checks: [{ code: "contact", level: "error", message: "Production contact remains a placeholder." }], disclaimer: "Not an audit or deployment approval." });
    if (p === "/patterns") return json(["prototype-botanical", "fern-trail", "meadow-sprig", "prototype-geometric", "diamond-path", "arch-grid", "harbor-stripe", "orchard-stripe", "ribbon-stripe", "prototype-woven", "basket-check", "linen-crosshatch", "terrace-wave", "pebble-drift", "confetti-grid"].map((key, i) => ({ id: key, name: key.replaceAll("-", " "), description: `Mock ${key}`, categoryId: ["botanical", "geometric", "striped", "woven", "abstract"][Math.floor(i / 3)], colorIds: ["ivory"], previewClassName: `api-${key}` })));
    if (p.startsWith("/designs/")) return json({ publicId: "AbCdEfGhIjKlMnOpQrStUv", shape: "box", width: 73.25, height: 49.75, backWidth: null, thickness: 13.5, unit: "cm", patternId: "terrace-wave", patternScale: 1.6, materialId: "linen-blend", fitPreference: "relaxed", closureType: "envelope", seamStyle: "piped" });
    if (p.startsWith("/shares/")) return json({ configuration });
    return json({ errors: [{ code: "resource_not_found", message: "Not found.", location: ["path"] }] }, 404);
  });
  return release;
}

function routes(directory = path.resolve("app"), prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? routes(path.join(directory, entry.name), `${prefix}/${entry.name}`) : entry.name === "page.tsx" ? [`${prefix}/`] : []);
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll<HTMLElement>("main *, header *, footer *")].filter(el => {
      const box = el.getBoundingClientRect();
      const clipsOwnOverflow = ["auto", "hidden", "scroll"].includes(getComputedStyle(el).overflowX);
      const hasInternalOverflow = el.scrollWidth > el.clientWidth + 1 && !clipsOwnOverflow;
      return box.width > 0 && (box.right > width + 1 || box.left < -1 || hasInternalOverflow) && !el.closest("table") && getComputedStyle(el).position !== "absolute";
    }).slice(0, 8).map(el => `${el.tagName} ${el.textContent?.slice(0, 65)} (${Math.round(el.getBoundingClientRect().width)}; ${el.scrollWidth}/${el.clientWidth})`);
    return { overflow: document.documentElement.scrollWidth - width, offenders };
  });
}

async function checkDocumentStructure(page: Page, route: string) {
  const structure = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll<HTMLElement>("[id]"), element => element.id);
    const references = Array.from(document.querySelectorAll<HTMLElement>("[aria-labelledby],[aria-describedby],[aria-controls]")).flatMap(element => ["aria-labelledby", "aria-describedby", "aria-controls"].flatMap(attribute => (element.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean)));
    const controls = Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:not([type='hidden']):not([type='button']):not([type='submit']), select, textarea"));
    return {
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      htmlLanguage: document.documentElement.lang,
      imageAlternativeFailures: Array.from(document.images).filter(image => !image.hasAttribute("alt")).map(image => image.currentSrc || image.src),
      mainCount: document.querySelectorAll("main").length,
      missingControlNames: controls.filter(control => !control.labels?.length && !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby") && !control.getAttribute("title")).map(control => control.outerHTML.slice(0, 160)),
      missingReferences: references.filter(id => document.getElementById(id) === null),
      title: document.title,
    };
  });
  expect(structure, route).toEqual({ duplicateIds: [], htmlLanguage: "en", imageAlternativeFailures: [], mainCount: 1, missingControlNames: [], missingReferences: [], title: expect.stringContaining("SewnCovers") });
  const accessibilityTree = await page.locator("body").ariaSnapshot();
  expect(accessibilityTree, route).toContain('navigation "Primary navigation"');
  expect(accessibilityTree, route).toContain("heading");
}

async function checkMatrix(page: Page, name: string, output: string) {
  for (const [width, height] of matrix) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    // Captures support a deliberate visual audit; normal runs need only the
    // semantic/geometry assertions, not hundreds of image artifacts.
    if (process.env.RESPONSIVE_CAPTURE === "true" || process.env.RESPONSIVE_AUDIT) {
      await page.screenshot({ path: path.join(output, `${name}-${width}x${height}.png`), fullPage: true });
    }
    const result = await geometry(page);
    if (process.env.RESPONSIVE_AUDIT) console.log(name, width, JSON.stringify(result));
    else expect(result.overflow, `${name} ${width}: ${result.offenders.join("; ")}`).toBeLessThanOrEqual(1);
    if (!process.env.RESPONSIVE_AUDIT) {
      const defects = await page.evaluate(() => {
        const visible = (el: Element) => el.getBoundingClientRect().width > 1 && getComputedStyle(el).visibility !== "hidden";
        const controls = [...document.querySelectorAll<HTMLElement>('button, input:not([type="hidden"]), select, textarea, a[href], summary')].filter(visible);
        const failures: string[] = [];
        for (const el of controls) {
          if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
          let target: Element = el;
          if (el instanceof HTMLInputElement && ["radio", "checkbox"].includes(el.type)) target = el.labels?.[0] ?? el;
          const box = target.getBoundingClientRect();
          if (box.width < 43.9 || box.height < 43.9) failures.push(`Small target ${el.getAttribute("aria-label") ?? el.textContent?.slice(0, 35) ?? el.tagName}: ${box.width} × ${box.height}`);
          if (el.matches('input:not([type="radio"]):not([type="checkbox"]):not([type="range"]), select, textarea') && parseFloat(getComputedStyle(el).fontSize) < 16) failures.push(`Small input text: ${el.getAttribute("name")}`);
          if (el.tagName === "BUTTON") {
            const next = el.nextElementSibling;
            if (next?.tagName === "BUTTON" && visible(next)) {
              const other = next.getBoundingClientRect();
              const gap = Math.abs(box.top - other.top) < 1 ? other.left - box.right : other.top - box.bottom;
              if (gap < 7.9) failures.push(`Action gap: ${el.textContent} ${gap}`);
            }
          }
        }
        return failures;
      });
      expect(defects, `${name} ${width}`).toEqual([]);
    }
  }
}

test.use({ hasTouch: true });
for (const role of ["guest", "customer", "administrator"] as const) {
  test(`responsive exported routes: ${role}`, async ({ page }, info) => {
    test.setTimeout(120000);
    await fixtures(page, role);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    // The static case study has its own role-independent width, forced-colors,
    // and reduced-motion matrix in portfolio-metadata.spec.ts.
    const accountStateRoutes = role === "guest"
      ? routes()
      : routes().filter((route) => route !== "/case-study/");
    for (const route of [...accountStateRoutes, "/404.html"]) {
      await page.goto(`${base}${route}`);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await page.waitForLoadState("networkidle");
      if (role === "guest") await checkDocumentStructure(page, route);
      if (role !== "guest") await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
      await expect(page.getByText(/response was malformed/)).toHaveCount(0);
      await checkMatrix(page, `${role}-${route.replaceAll("/", "_")}`, info.outputDir);
    }
    expect(errors).toEqual([]);
  });
}

test("responsive populated details and operational controls", async ({ page }, info) => {
  test.setTimeout(120000);
  await fixtures(page, "administrator");
  for (const [name, route] of [["project", `/projects/?project=${id}`], ["order", `/orders/?order=${orderId}`], ["return", `/checkout/return/?order=${orderId}`], ["sandbox", `/checkout/sandbox/?session=sc_demo_attempt_browser_00001&order=${orderId}`], ["public", "/configure/?design=AbCdEfGhIjKlMnOpQrStUv"], ["shared", `/configure/?share=${"H".repeat(43)}`], ["admin", "/admin/"]]) {
    await page.goto(`${base}${route}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/response was malformed/)).toHaveCount(0);
    if (name === "shared") await expect(page.getByText(/Read-only project share restored/)).toBeVisible();
    if (name === "public") await expect(page.getByText("Shared design restored.")).toBeVisible();
    if (name === "admin") {
      await page.getByRole("button", { name: "Review specification" }).click();
      await page.getByRole("button", { name: /SC-DEMO-WORK0001/ }).click();
      await page.getByText("Immutable production specification", { exact: true }).click();
      await page.getByRole("button", { name: "Load aggregates" }).click();
      await expect(page.getByText("Suppressed", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Run readiness checks" }).click();
    }
    await checkMatrix(page, name, info.outputDir);
  }
});

for (const state of ["empty", "error", "loading"]) {
  test(`responsive asynchronous states: ${state}`, async ({ page }, info) => {
    test.setTimeout(120000);
    const release = await fixtures(page, "administrator", state);
    for (const route of ["account", "projects", "commerce", "cart", "orders", "admin"]) {
      await page.goto(`${base}/${route}/`);
      if (state !== "loading") await page.waitForLoadState("networkidle");
      else await expect(page.getByRole("status").filter({ hasText: /Loading|Checking|Restoring/ }).first()).toBeVisible();
      await checkMatrix(page, `${state}-${route}`, info.outputDir);
    }
    release();
  });
}

test("responsive configurator stages and touch controls", async ({ page }, info) => {
  test.setTimeout(120000);
  await fixtures(page, "customer");
  await page.goto(`${base}/configure/?design=AbCdEfGhIjKlMnOpQrStUv`);
  await expect(page.getByText("Shared design restored.")).toBeVisible();
  for (const stage of ["Measurements", "Cover details", "Pattern", "Preview", "Review"]) {
    await page.getByRole("button", { name: `Continue to ${stage}` }).tap();
    await checkMatrix(page, stage, info.outputDir);
    if (stage === "Preview") {
      await page.getByRole("button", { name: "Load approximate 3D preview" }).tap();
      await page.getByRole("button", { name: "Expanded controls" }).tap();
      await checkMatrix(page, "dialog", info.outputDir);
      await page.getByRole("button", { name: "Close expanded controls" }).tap();
    }
  }
});

test("touch navigation, form errors, table scrolling and forced-colors reflow", async ({ page }, info) => {
  await fixtures(page, "guest");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${base}/account/`);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.tap();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await menu.press("Escape");
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Sign in", exact: true }).tap();
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await checkMatrix(page, "validation-forced-colors", info.outputDir);
  await page.getByRole("link", { name: "Create account", exact: true }).tap();
  const terms = page.getByRole("checkbox");
  await terms.check();
  await expect(terms).toBeChecked();
  await page.goto(`${base}/legal/`);
  await page.setViewportSize({ width: 320, height: 568 });
  const region = page.getByRole("region", { name: "Processing categories and retention" });
  await region.focus();
  await region.press("ArrowRight");
  await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await expect(region).toBeFocused();
  expect(await region.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
  expect((await geometry(page)).overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('thead th[scope="col"]')).toHaveCount(3);
  await expect(page.locator('tbody th[scope="row"]')).toHaveCount(4);
  const consent = page.getByRole("complementary", { name: "Analytics preferences" });
  await consent.scrollIntoViewIfNeeded();
  expect(await consent.evaluate(el => getComputedStyle(el).position)).toBe("static");
  await page.getByRole("button", { name: "Reject optional" }).tap();
  await expect(page.getByRole("button", { name: "Change analytics preferences" })).toBeVisible();
});

test("public content reflows with WCAG text-spacing overrides", async ({ page }) => {
  await fixtures(page, "guest");
  await page.setViewportSize({ width: 320, height: 568 });

  for (const route of ["/", "/configure/", "/commerce/", "/case-study/", "/trust/", "/legal/"]) {
    await page.goto(`${base}${route}`);
    await page.addStyleTag({
      content: `
        body { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
        p { margin-bottom: 2em !important; }
      `,
    });
    const result = await geometry(page);
    expect(result.overflow, `${route}: ${result.offenders.join("; ")}`).toBeLessThanOrEqual(1);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }
});
