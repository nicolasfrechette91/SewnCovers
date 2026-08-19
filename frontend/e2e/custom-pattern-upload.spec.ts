import { expect, test, type Route } from "@playwright/test";

const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://api.sewncovers.test";
const basePath = process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const configurePath = `${basePath}/configure/`;
const token = "S".repeat(43);
const uploadId = "U".repeat(22);
const derivativeId = "D".repeat(22);
const directToken = "T".repeat(43);
const accessToken = "A".repeat(43);
const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
const headers = {
  "access-control-allow-origin": appOrigin,
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "DELETE, GET, PATCH, POST, PUT, OPTIONS",
  "content-type": "application/json",
};

function status(state: "approved" | "awaiting_moderation" | "failed" | "rejected" | "deleted", marker = "U") {
  return {
    id: marker.repeat(22),
    label: state === "approved" || state === "deleted" ? "My garden repeat" : `${state} example`,
    state,
    moderationState: state === "approved" ? "approved" : state === "rejected" ? "rejected" : state === "awaiting_moderation" ? "unavailable" : "failed",
    contentType: "image/png",
    byteSize: 400,
    width: state === "approved" ? 64 : null,
    height: state === "approved" ? 64 : null,
    processingVersion: "tile-v1",
    tileDerivativeId: state === "approved" ? derivativeId : null,
    thumbnailDerivativeId: state === "approved" ? "N".repeat(22) : null,
    processingAttempts: state === "failed" ? 1 : 0,
    moderationAttempts: 1,
    retryEligible: state === "failed" || state === "awaiting_moderation",
    referencedByVersions: state === "approved" ? 1 : 0,
    createdAt: "2026-08-18T12:00:00Z",
    updatedAt: "2026-08-18T12:00:00Z",
    deletedAt: state === "deleted" ? "2026-08-18T12:05:00Z" : null,
  };
}

async function json(route: Route, body: unknown, code = 200) {
  await route.fulfill({ body: JSON.stringify(body), headers, status: code });
}

test("authenticated customer uploads, selects, previews, and deletes a moderated pattern", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript((value) => sessionStorage.setItem("sewncovers.session-token", value), token);
  let uploaded = false;
  let deleted = false;
  let imageBytes: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") return route.fulfill({ headers, status: 204 });
    if (path === "/account") return json(route, { email: "pattern@example.com", createdAt: "2026-08-18T09:00:00Z" });
    if (path === "/account/sessions") return json(route, [{ id: 1, createdAt: "2026-08-18T09:00:00Z", expiresAt, revokedAt: null, current: true }]);
    if (path === "/patterns") return json(route, []);
    if (path === "/uploads" && request.method() === "GET") {
      const lifecycle = [
        status("awaiting_moderation", "M"),
        status("failed", "F"),
        status("rejected", "R"),
      ];
      return json(route, uploaded ? [status(deleted ? "deleted" : "approved"), ...lifecycle] : lifecycle);
    }
    if (path === "/uploads" && request.method() === "POST") return json(route, { ...status("awaiting_moderation"), state: "awaiting_upload", moderationState: "not_started", upload: { method: "PUT", url: `/uploads/direct/${directToken}`, headers: { "Content-Type": "image/png" }, fields: {}, expiresAt } }, 201);
    if (path === `/uploads/direct/${directToken}` && request.method() === "PUT") { imageBytes = request.postDataBuffer() ?? Buffer.alloc(0); return route.fulfill({ headers, status: 204 }); }
    if (path === `/uploads/${uploadId}/complete`) { uploaded = true; return json(route, status("approved")); }
    if (path === `/uploads/${uploadId}` && request.method() === "GET") return json(route, status(deleted ? "deleted" : "approved"));
    if (path === `/uploads/${uploadId}` && request.method() === "DELETE") { deleted = true; return json(route, { id: uploadId, state: "deleted", referencedByVersions: 1 }); }
    if (path === `/uploads/${uploadId}/assets/tile/access`) return json(route, { url: `/assets/direct/${accessToken}/tile`, expiresAt, contentType: "image/png" });
    if (path === `/assets/direct/${accessToken}/tile`) return route.fulfill({ body: imageBytes, headers: { ...headers, "content-type": "image/png", "cache-control": "private, no-store" } });
    return json(route, { errors: [{ code: "resource_not_found", message: "Not found.", location: ["path"] }] }, 404);
  });

  await page.goto(configurePath);
  const boxShape = page.getByRole("radio", { name: "Box / bench cushion" });
  await boxShape.focus();
  await boxShape.press("Space");
  await page.getByRole("textbox", { name: "Width (cm)" }).fill("73.25");
  await page.getByRole("textbox", { name: "Depth (cm)" }).fill("49.75");
  await page.getByRole("textbox", { name: "Thickness (cm)" }).fill("13.5");
  const input = page.getByLabel("Choose a pattern image");
  await expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#37644c"; context.fillRect(0, 0, 64, 64);
    context.fillStyle = "#f2e8cf"; context.fillRect(0, 0, 24, 24);
    return canvas.toDataURL("image/png");
  });
  await input.setInputFiles({ name: "garden.png", mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1], "base64") });
  await expect(page.getByLabel("Repeating preview of the selected local image")).toBeVisible();
  await page.getByRole("button", { name: "Upload for review" }).press("Enter");
  await expect(page.getByText("My garden repeat")).toBeVisible();
  await expect(page.getByText(/moderation unavailable; approval is fail-closed/)).toBeVisible();
  await expect(page.getByText("Processing failed", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Select custom pattern My garden repeat" }).press("Space");
  await expect(page.getByText(/selected for this private project configuration/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("referenced by 1 saved version");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Delete" }).first().press("Enter");
  await expect(page.getByText(/Custom pattern deleted and access revoked/)).toBeVisible();
});
