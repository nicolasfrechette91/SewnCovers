import { expect, test, type Route } from "@playwright/test";

const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://api.sewncovers.test";
const basePath =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const token = "A".repeat(43);
const workId = "W".repeat(22);
const corsHeaders = {
  "access-control-allow-origin": appOrigin,
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "DELETE, GET, PATCH, POST, PUT, OPTIONS",
  "content-type": "application/json",
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    headers: corsHeaders,
    status,
  });
}

test("advanced preview, consent, legal, and trust stay keyboard-accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      return route.fulfill({ headers: corsHeaders, status: 204 });
    }
    if (path === "/analytics/consent") {
      return json(route, {
        status: "rejected",
        documentVersion: 1,
        privacySignal: false,
        decidedAt: "2026-08-29T12:00:00Z",
        behavior: "Optional collection remains off.",
      });
    }
    if (path === "/patterns") {
      const records = [
        ["prototype-botanical", "Botanical sample", "botanical"],
        ["fern-trail", "Fern trail", "botanical"],
        ["meadow-sprig", "Meadow sprig", "botanical"],
        ["prototype-geometric", "Geometric sample", "geometric"],
        ["diamond-path", "Diamond path", "geometric"],
        ["arch-grid", "Arch grid", "geometric"],
        ["harbor-stripe", "Harbor stripe", "striped"],
        ["orchard-stripe", "Orchard stripe", "striped"],
        ["ribbon-stripe", "Ribbon stripe", "striped"],
        ["prototype-woven", "Woven sample", "woven"],
        ["basket-check", "Basket check", "woven"],
        ["linen-crosshatch", "Linen crosshatch", "woven"],
      ] as const;
      return json(route, records.map(([id, name, categoryId]) => ({
          id,
          name,
          description: "Fictional local motif.",
          previewClassName: `api-${id}`,
          categoryId,
          colorIds: ["ivory"],
        })));
    }
    if (path === "/designs/AbCdEfGhIjKlMnOpQrStUv") {
      return json(route, {
        publicId: "AbCdEfGhIjKlMnOpQrStUv",
        shape: "rectangle",
        width: 80,
        height: 45,
        backWidth: null,
        thickness: 12,
        unit: "cm",
        patternId: "prototype-botanical",
        patternScale: 1,
        materialId: "cotton-canvas",
        fitPreference: "standard",
        closureType: "zipper",
        seamStyle: "plain",
      });
    }
    return json(route, { errors: [{ code: "resource_not_found", message: "Not found.", location: ["path"] }] }, 404);
  });

  await page.goto(`${basePath}/configure/`);
  await page.getByRole("button", { name: "Reject optional" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Core features are unchanged/)).toBeVisible();

  await page.getByRole("radio", { name: "Square cushion" }).focus();
  await page.keyboard.press("Space");
  await page
    .getByRole("button", { name: "Continue to Measurements" })
    .press("Enter");
  await page.getByRole("textbox", { name: "Width (cm)" }).fill("80");
  await page.getByRole("textbox", { name: "Thickness (cm)" }).fill("12");
  await page
    .getByRole("button", { name: "Continue to Cover details" })
    .press("Enter");
  await page
    .getByRole("button", { name: "Continue to Pattern" })
    .press("Enter");
  await page.getByRole("radio", { name: "Botanical sample" }).focus();
  await page.keyboard.press("Space");
  await page
    .getByRole("button", { name: "Continue to Preview" })
    .press("Enter");
  await page.getByRole("button", { name: "Load approximate 3D preview" }).focus();
  await page.keyboard.press("Enter");

  const canvas = page.getByLabel(/Interactive approximate cushion model/);
  await expect(canvas).toHaveAttribute("tabindex", "0");
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("+");
  await expect(page.getByText(/zoom 1\.10/)).toBeVisible();
  await page.getByRole("button", { name: "Top" }).press("Enter");
  await page.getByRole("button", { name: "Reset view" }).press("Enter");
  const expanded = page.getByRole("button", { name: "Expanded controls" });
  await expanded.press("Enter");
  await page.getByRole("button", { name: "Close expanded controls" }).press("Enter");
  await expect(expanded).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await page.goto(`${basePath}/legal/`);
  await expect(page.getByRole("heading", { name: "Legal and consent information" })).toBeVisible();
  await page.goto(`${basePath}/trust/`);
  await expect(page.getByRole("heading", { name: "Trust, boundaries, and readiness" })).toBeVisible();

  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind,
      ...args
    ) {
      if (kind === "webgl" || kind === "webgl2") return null;
      return original.call(this, kind, ...args);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto(
    `${basePath}/configure/?design=AbCdEfGhIjKlMnOpQrStUv`,
  );
  await expect(page.getByText("Shared design restored.")).toBeVisible();
  for (const nextStage of [
    "Measurements",
    "Cover details",
    "Pattern",
    "Preview",
  ]) {
    await page
      .getByRole("button", { name: `Continue to ${nextStage}` })
      .press("Enter");
  }
  await page.getByRole("button", { name: "Load approximate 3D preview" }).press("Enter");
  await expect(page.getByText(/3D is unavailable.*complete 2D preview/)).toBeVisible();
});

test("administrator production, analytics, packet, and readiness workflow is isolated", async ({
  page,
}) => {
  await page.addInitScript((value) => {
    sessionStorage.setItem("sewncovers.session-token", value);
  }, token);
  let revision = 1;
  let state = "review";
  let qualityState = "pending";
  let checklistStatus = "pending";
  const work = () => ({
    id: workId,
    orderReference: "SC-DEMO-WORK0001",
    lineIndex: 0,
    state,
    qualityState,
    revision,
    specification: { shape: "box", measurements: { width: "80", unit: "cm" } },
    checklist: [{ itemKey: "specification_review", status: checklistStatus }],
    issues: [],
    history: [{ action: "created", fromState: null, toState: "review", createdAt: "2026-08-29T12:00:00Z" }],
    demonstration: true,
  });
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") return route.fulfill({ headers: corsHeaders, status: 204 });
    if (path === "/account") return json(route, { email: "operations@example.invalid", createdAt: "2026-08-29T00:00:00Z", role: "administrator" });
    if (path === "/account/sessions") return json(route, [{ id: 1, createdAt: "2026-08-29T00:00:00Z", expiresAt: "2026-08-30T00:00:00Z", revokedAt: null, current: true }]);
    if (path === "/admin/price-books" || path === "/admin/orders" || path === "/admin/audit") return json(route, []);
    if (path === "/admin/production-work") return json(route, { items: [work()], page: 1, pageSize: 20, total: 1 });
    if (path.includes("/checklist/")) { checklistStatus = "complete"; revision += 1; return json(route, work()); }
    if (path.endsWith("/issues")) { revision += 1; return json(route, work(), 201); }
    if (path.endsWith("/transition")) { state = request.postDataJSON().targetState; revision += 1; return json(route, work()); }
    if (path.includes("/quality/pass")) { qualityState = "passed"; revision += 1; return json(route, work()); }
    if (path.endsWith("/packet")) return json(route, { content: "safe demonstration packet", checksum: "a".repeat(64), generatedAt: "2026-08-29T12:00:00Z" });
    if (path === "/admin/analytics/aggregates") return json(route, { demonstration: true, fixtureBacked: true, fromTime: "2026-07-29T00:00:00Z", toTime: "2026-08-29T00:00:00Z", timezone: "UTC", consentScope: "Affirmative optional consent only.", suppressionThreshold: 3, freshness: "Fixture generated at 2026-08-29T00:00:00Z", items: [{ eventType: "visualization_fallback", count: null, suppressed: true }], limitations: ["Fictional fixture only."] });
    if (path === "/readiness") return json(route, { ready: false, checks: [{ code: "contact", level: "error", message: "Production contact remains a placeholder." }], disclaimer: "Not an audit or deployment approval." });
    return json(route, { errors: [{ code: "resource_not_found", message: "Not found.", location: ["path"] }] }, 404);
  });

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`${basePath}/admin/`);
  await page.getByRole("button", { name: /SC-DEMO-WORK0001/ }).press("Enter");
  await expect(page.getByRole("heading", { name: `Work ${workId}` })).toBeFocused();
  await page.getByRole("button", { name: "Complete" }).press("Enter");
  await page.getByRole("textbox", { name: "Structured reason" }).fill("Fictional manual review");
  await page.getByRole("button", { name: "Add issue" }).press("Enter");
  await page.getByRole("button", { name: "Approve work" }).press("Enter");
  await page.getByRole("button", { name: "Start production" }).press("Enter");
  await page.getByRole("button", { name: "Start quality check" }).press("Enter");
  await page.getByRole("button", { name: "Pass quality" }).press("Enter");
  await page.getByRole("button", { name: "Fulfilment handoff" }).press("Enter");
  await page.getByRole("button", { name: "Download safe packet" }).press("Enter");
  await expect(page.getByText(/checksum .* verified and downloaded/i)).toBeVisible();

  await page.getByRole("button", { name: "Load aggregates" }).press("Enter");
  await expect(page.getByText("Suppressed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run readiness checks" }).press("Enter");
  await expect(page.getByText(/blocking configuration errors remain/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
