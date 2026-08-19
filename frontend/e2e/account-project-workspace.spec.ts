import { expect, test, type Page, type Route } from "@playwright/test";

const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://api.sewncovers.test";
const basePath = process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const accountPath = `${basePath}/account/`;
const configurePath = `${basePath}/configure/`;
const sessionToken = "S".repeat(43);
const shareToken = "H".repeat(43);
const projectId = "P".repeat(22);
const versionOneId = "V".repeat(22);
const versionTwoId = "W".repeat(22);
const grantId = "G".repeat(22);
const expiresAt = "2026-08-25T12:00:00Z";

const configuration = {
  shape: "box", width: 73.25, height: 49.75, backWidth: null,
  thickness: 13.5, unit: "cm",
  pattern: { kind: "built-in", patternId: "terrace-wave" },
  patternScale: 1.6, materialId: "linen-blend", fitPreference: "relaxed",
  closureType: "envelope", seamStyle: "piped",
} as const;

const patternIds = [
  "prototype-botanical", "fern-trail", "meadow-sprig",
  "prototype-geometric", "diamond-path", "arch-grid",
  "harbor-stripe", "orchard-stripe", "ribbon-stripe",
  "prototype-woven", "basket-check", "linen-crosshatch",
  "terrace-wave", "pebble-drift", "confetti-grid",
];
const patterns = patternIds.map((id, index) => ({
  id, name: id.replaceAll("-", " "), description: `Mock ${id}`,
  categoryId: ["botanical", "geometric", "striped", "woven", "abstract"][Math.floor(index / 3)],
  colorIds: ["ivory"], previewClassName: `api-${id}`,
}));
const corsHeaders = {
  "access-control-allow-origin": appOrigin,
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "DELETE, GET, PATCH, POST, PUT, OPTIONS",
  "content-type": "application/json",
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), headers: corsHeaders, status });
}

async function blockUnrelatedNetwork(page: Page) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:3100(?:\/|$)|api\.sewncovers\.test(?:\/|$)).*/, (route) => route.abort("blockedbyclient"));
}

test("account workspace preserves immutable history and revocable sharing", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await blockUnrelatedNetwork(page);
  let name = "Patio bench";
  let revoked = false;
  let deleted = false;
  let versionCount = 2;
  let capturedVersion: unknown;
  const versions = () => [
    { id: versionTwoId, versionNumber: 2, configuration, createdAt: "2026-08-18T11:00:00Z", isCurrent: versionCount === 2 },
    { id: versionOneId, versionNumber: 1, configuration: { ...configuration, patternScale: 1 }, createdAt: "2026-08-18T10:00:00Z", isCurrent: false },
    ...(versionCount === 3 ? [{ id: "N".repeat(22), versionNumber: 3, configuration: { ...configuration, patternScale: 1 }, createdAt: "2026-08-18T12:00:00Z", isCurrent: true }] : []),
  ].sort((a, b) => b.versionNumber - a.versionNumber);
  const detail = () => ({
    id: projectId, name, versionCount, updatedAt: "2026-08-18T12:00:00Z",
    privacy: revoked ? "private" : "shared", createdAt: "2026-08-18T10:00:00Z",
    currentVersion: versions()[0],
    activeShares: revoked ? [] : [{ id: grantId, versionId: versionTwoId, versionNumber: 2, createdAt: "2026-08-18T11:30:00Z" }],
  });

  const handleApi = async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === "OPTIONS") return route.fulfill({ headers: corsHeaders, status: 204 });
    if (method === "POST" && path === "/auth/register") return json(route, { account: { email: "person@example.com", createdAt: "2026-08-18T09:00:00Z" }, token: sessionToken, expiresAt }, 201);
    if (method === "POST" && path === "/auth/login") return json(route, { account: { email: "person@example.com", createdAt: "2026-08-18T09:00:00Z" }, token: sessionToken, expiresAt });
    if (method === "POST" && ["/auth/logout", "/auth/logout-all"].includes(path)) return route.fulfill({ headers: corsHeaders, status: 204 });
    if (method === "GET" && path === "/account") return json(route, { email: "person@example.com", createdAt: "2026-08-18T09:00:00Z" });
    if (method === "GET" && path === "/account/sessions") return json(route, [{ id: 1, createdAt: "2026-08-18T09:00:00Z", expiresAt, revokedAt: null, current: true }]);
    if (method === "GET" && path === "/account/export") return json(route, { formatVersion: 1, account: { email: "person@example.com" }, projects: [] });
    if (method === "POST" && path === "/account/delete") return json(route, { deleted: true });
    if (method === "GET" && path === "/patterns") return json(route, patterns);
    if (method === "GET" && path === "/projects") return json(route, deleted ? [] : [{ id: projectId, name, versionCount, updatedAt: "2026-08-18T12:00:00Z", privacy: revoked ? "private" : "shared" }]);
    if (method === "GET" && path === `/projects/${projectId}`) return json(route, detail());
    if (method === "PATCH" && path === `/projects/${projectId}`) { name = request.postDataJSON().name; return json(route, detail()); }
    if (method === "DELETE" && path === `/projects/${projectId}`) { deleted = true; return route.fulfill({ headers: corsHeaders, status: 204 }); }
    if (method === "GET" && path === `/projects/${projectId}/versions`) return json(route, versions());
    if (method === "GET" && path.startsWith(`/projects/${projectId}/versions/`)) {
      const id = path.split("/").at(-1); return json(route, versions().find((version) => version.id === id));
    }
    if (method === "POST" && path === `/projects/${projectId}/versions`) { capturedVersion = request.postDataJSON(); versionCount = 3; return json(route, versions()[0], 201); }
    if (method === "POST" && path.endsWith("/shares")) return json(route, { id: grantId, versionId: versionTwoId, versionNumber: 2, createdAt: "2026-08-18T11:30:00Z", shareToken }, 201);
    if (method === "DELETE" && path === `/projects/${projectId}/shares/${grantId}`) { revoked = true; return route.fulfill({ headers: corsHeaders, status: 204 }); }
    if (method === "GET" && path === `/shares/${shareToken}`) return revoked ? json(route, { errors: [{ code: "resource_not_found", message: "Shared configuration not found.", location: ["path", "share_token"] }] }, 404) : json(route, { configuration });
    return json(route, { errors: [{ code: "resource_not_found", message: "Not found.", location: ["path"] }] }, 404);
  };
  await page.route(`${apiOrigin}/**`, handleApi);

  await page.goto(accountPath);
  await page.locator("#register-email").fill("person@example.com");
  await page.locator("#register-password").fill("correct horse battery staple");
  await page.locator("#register-password").press("Enter");
  await expect(page.getByRole("heading", { name: "person@example.com" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(1);

  await page.getByRole("link", { name: "Open My projects" }).press("Enter");
  await expect(page.getByRole("heading", { name: "Patio bench" })).toBeVisible();
  await page.getByRole("link", { name: "Open project" }).press("Enter");
  await expect(page.getByRole("heading", { name: /Version history/ })).toBeVisible();
  await page.locator("#project-name").fill("Patio bench renamed");
  await page.locator("#project-name").press("Enter");
  await expect(page.getByRole("heading", { name: "Patio bench renamed" })).toBeVisible();

  await page.getByRole("link", { name: "Open as editing basis" }).last().press("Enter");
  await expect(page.getByText(/Private project version restored as an editing basis/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Width (cm)" })).toHaveValue("73.25");
  await page.getByRole("button", { name: "Review configuration" }).press("Enter");
  await page.getByRole("button", { name: "Save as new version" }).press("Enter");
  await expect(page.getByText(/Version 3 saved/)).toBeVisible();
  expect(capturedVersion).toEqual({ configuration: { ...configuration, patternScale: 1 } });

  await page.getByRole("link", { name: "Open saved project" }).press("Enter");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole("button", { name: "Create read-only share" }).first().press("Enter");
  const shareInput = page.getByLabel("Share URL");
  await expect(shareInput).toBeFocused();
  const shareUrl = await shareInput.inputValue();
  expect(shareUrl).toContain(`${configurePath}?share=${shareToken}`);

  const guest = await page.context().newPage();
  await blockUnrelatedNetwork(guest);
  await guest.route(`${apiOrigin}/**`, handleApi);
  await guest.setViewportSize({ width: 1440, height: 900 });
  await guest.goto(shareUrl);
  await expect(guest.getByText(/Read-only project share restored/)).toBeVisible();
  await expect(guest.getByRole("textbox", { name: "Width (cm)" })).toHaveValue("73.25");

  await page.getByRole("button", { name: "Revoke share" }).first().press("Enter");
  await expect(page.getByText(/Private — no active project share links/)).toBeVisible();
  await guest.reload();
  await expect(guest.getByText("Shared configuration not found.")).toBeVisible();
  await guest.close();

  await page.getByRole("button", { name: "Review project deletion" }).press("Enter");
  await page.getByRole("button", { name: "Permanently delete project" }).press("Enter");
  await expect(page.getByRole("heading", { name: "No private projects yet" })).toBeVisible();

  await page.getByRole("link", { name: "Account" }).press("Enter");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export my data" }).press("Enter");
  expect((await downloadPromise).suggestedFilename()).toBe("sewncovers-account-export.json");
  await page.getByRole("button", { name: "Sign out", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.locator("#login-email").fill("person@example.com");
  await page.locator("#login-password").fill("correct horse battery staple");
  await page.locator("#login-password").press("Enter");
  await page.getByRole("button", { name: "Review account deletion" }).press("Enter");
  await expect(page.locator("#delete-password")).toBeFocused();
  await page.locator("#delete-password").fill("correct horse battery staple");
  await page.locator("#delete-password").press("Enter");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("an authenticated 401 clears the tab session and returns to sign in", async ({ page }) => {
  await blockUnrelatedNetwork(page);
  await page.addInitScript((token) => sessionStorage.setItem("sewncovers.session-token", token), sessionToken);
  await page.route(`${apiOrigin}/**`, (route) => json(route, { errors: [{ code: "authentication_required", message: "Authentication is required or the session is no longer valid.", location: ["header", "Authorization"] }] }, 401));
  await page.goto(accountPath);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  await page.goto(configurePath);
  await expect(page.getByRole("heading", { name: "Build your custom cover specification." })).toBeVisible();
});
