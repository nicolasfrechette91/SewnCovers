import { expect, test, type Route } from "@playwright/test";

const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://api.sewncovers.test";
const basePath =
  process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const token = "A".repeat(43);
const workId = "W".repeat(22);
const sessionExpiresAt = "2099-08-30T00:00:00Z";
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

test("preview and legal content stay keyboard-accessible", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      return route.fulfill({ headers: corsHeaders, status: 204 });
    }
    if (path === "/patterns") {
      const records = [
        ["prototype-botanical", "Seed scatter", "botanical"],
        ["fern-trail", "Fern trail", "botanical"],
        ["meadow-sprig", "Meadow sprig", "botanical"],
        ["prototype-geometric", "Harlequin", "geometric"],
        ["diamond-path", "Diamond path", "geometric"],
        ["arch-grid", "Arch grid", "geometric"],
        ["harbor-stripe", "Harbour stripe", "striped"],
        ["orchard-stripe", "Orchard stripe", "striped"],
        ["ribbon-stripe", "Ribbon stripe", "striped"],
        ["prototype-woven", "Fine weave", "woven"],
        ["basket-check", "Basket check", "woven"],
        ["linen-crosshatch", "Linen crosshatch", "woven"],
      ] as const;
      return json(
        route,
        records.map(([id, name, categoryId]) => ({
          id,
          name,
          description: "Fictional local motif.",
          previewClassName: `api-${id}`,
          categoryId,
          colorIds: ["ivory"],
        })),
      );
    }
    return json(
      route,
      {
        errors: [
          {
            code: "resource_not_found",
            message: "Not found.",
            location: ["path"],
          },
        ],
      },
      404,
    );
  });

  await page.goto(`${basePath}/configure/`);
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
  await expect(
    page.locator("#configuration-pattern-edit-target"),
  ).toBeFocused();
  await page.getByRole("radio", { name: "Seed scatter" }).press("Space");
  await page
    .getByRole("button", { name: "Continue to Preview" })
    .press("Enter");
  await expect(
    page.getByRole("slider", { name: "Pattern size" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await page.goto(`${basePath}/legal/`);
  await expect(
    page.getByRole("heading", { name: "Legal information" }),
  ).toBeVisible();
});

test("administrator production, packet, and readiness workflow is isolated", async ({
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
    history: [
      {
        action: "created",
        fromState: null,
        toState: "review",
        createdAt: "2026-08-29T12:00:00Z",
      },
    ],
    demonstration: true,
  });
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS")
      return route.fulfill({ headers: corsHeaders, status: 204 });
    if (path === "/account")
      return json(route, {
        email: "operations@example.invalid",
        createdAt: "2026-08-29T00:00:00Z",
        role: "administrator",
      });
    if (path === "/account/sessions")
      return json(route, [
        {
          id: 1,
          createdAt: "2026-08-29T00:00:00Z",
          expiresAt: sessionExpiresAt,
          revokedAt: null,
          current: true,
        },
      ]);
    if (
      path === "/admin/price-books" ||
      path === "/admin/orders" ||
      path === "/admin/audit"
    )
      return json(route, []);
    if (path === "/admin/production-work")
      return json(route, { items: [work()], page: 1, pageSize: 20, total: 1 });
    if (path.includes("/checklist/")) {
      checklistStatus = "complete";
      revision += 1;
      return json(route, work());
    }
    if (path.endsWith("/issues")) {
      revision += 1;
      return json(route, work(), 201);
    }
    if (path.endsWith("/transition")) {
      state = request.postDataJSON().targetState;
      revision += 1;
      return json(route, work());
    }
    if (path.includes("/quality/pass")) {
      qualityState = "passed";
      revision += 1;
      return json(route, work());
    }
    if (path.endsWith("/packet"))
      return json(route, {
        content: "safe demonstration packet",
        checksum: "a".repeat(64),
        generatedAt: "2026-08-29T12:00:00Z",
      });
    if (path === "/readiness")
      return json(route, {
        ready: false,
        checks: [
          {
            code: "contact",
            level: "error",
            message: "Production contact remains a placeholder.",
          },
        ],
        disclaimer: "Not an audit or deployment approval.",
      });
    return json(
      route,
      {
        errors: [
          {
            code: "resource_not_found",
            message: "Not found.",
            location: ["path"],
          },
        ],
      },
      404,
    );
  });

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`${basePath}/admin/`);
  await page.getByRole("button", { name: /SC-DEMO-WORK0001/ }).press("Enter");
  await expect(
    page.getByRole("heading", { name: `Work ${workId}` }),
  ).toBeFocused();
  // Each step waits for the one before it to finish, as an administrator
  // would: the API rejects a step sent with an outdated revision.
  const step = async (button: string, outcome: string) => {
    await page.getByRole("button", { name: button }).press("Enter");
    await expect(page.getByText(outcome, { exact: true })).toBeVisible();
  };
  await step("Complete", "Checklist specification_review updated.");
  await page
    .getByRole("textbox", { name: "Structured reason" })
    .fill("Fictional manual review");
  await step(
    "Add issue",
    "Manual-review issue created and retained in history.",
  );
  await step("Approve work", "Work approved.");
  await step("Start production", "Production started.");
  await step("Start quality check", "Moved to quality check.");
  await step("Pass quality", "Quality control passed.");
  await step("Fulfilment handoff", "Handed off to fulfilment.");
  await page
    .getByRole("button", { name: "Download safe packet" })
    .press("Enter");
  await expect(
    page.getByText(/checksum .* verified and downloaded/i),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Run readiness checks" })
    .press("Enter");
  await expect(
    page.getByText(/blocking configuration errors remain/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
