import { expect, test, type Page, type Route } from "@playwright/test";

const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://api.sewncovers.test";
const basePath = process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
const customerToken = "C".repeat(43);
const adminToken = "A".repeat(43);
const projectId = "P".repeat(22);
const versionId = "V".repeat(22);
const quoteId = "Q".repeat(22);
const lineId = "L".repeat(22);
const cartId = "K".repeat(22);
const orderId = "O".repeat(22);
const priceBookId = "B".repeat(22);
const attemptSession = "sc_demo_attempt_browser_00001";
const expiry = new Date(Date.now() + 3_600_000).toISOString();

const configuration = { shape: "box", width: 73.25, height: 49.75, backWidth: null, thickness: 13.5, unit: "cm", pattern: { kind: "built-in", patternId: "terrace-wave" }, patternScale: 1.6, materialId: "linen-blend", fitPreference: "relaxed", closureType: "envelope", seamStyle: "piped" };
const pricing = { demonstration: true, modelLabel: "Demonstration CAD price model v1", priceBookVersion: 1, currency: "CAD", quantity: 1, unitAmountMinor: 10450, subtotalAmountMinor: 10450, subtotalFormatted: "$104.50 CAD", breakdown: [{ code: "shape-base", label: "Shape base", amountMinor: 8000, basis: "box" }, { code: "material", label: "Material adjustment", amountMinor: 1200, basis: "linen-blend" }], taxTreatment: "Tax is calculated by the hosted checkout provider.", shippingTreatment: "Shipping is calculated by the hosted checkout provider." };
const quote = { ...pricing, id: quoteId, status: "active", projectVersionId: versionId, configuration, createdAt: "2026-08-28T12:00:00Z", expiresAt: "2026-09-04T12:00:00Z", canCheckout: true, customAsset: null };

const corsHeaders = { "access-control-allow-origin": appOrigin, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "DELETE, GET, PATCH, POST, PUT, OPTIONS", "content-type": "application/json" };
async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ body: JSON.stringify(body), headers: corsHeaders, status }); }
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); }

test("sandbox quote-to-delivery workflow stays authoritative and role protected", async ({ browser }) => {
  let quoted = false;
  let inCart = false;
  let quantity = 1;
  let paid = false;
  let orderState = "payment_pending";
  let paymentStatus = "pending";
  const order = () => ({ id: orderId, reference: "SC-DEMO-ORDER0001", demonstration: true, createdAt: "2026-08-28T12:00:00Z", state: orderState, paymentStatus, currency: "CAD", subtotalAmountMinor: 10450 * quantity, taxAmountMinor: paid ? 1515 : 0, shippingAmountMinor: paid ? 1200 : 0, totalAmountMinor: paid ? 10450 * quantity + 2715 : 10450 * quantity, totalFormatted: `$${((paid ? 10450 * quantity + 2715 : 10450 * quantity) / 100).toFixed(2)} CAD`, lines: [{ quoteId, quantity, extendedAmountMinor: 10450 * quantity, configuration, productionSpecification: { shape: "box", measurements: { width: "73.25", height: "49.75", thickness: "13.5", unit: "cm" }, material: "linen-blend", fit: "relaxed", closureAccess: "envelope", edgeFinish: "piped", patternScale: "1.6", configurationVersionReference: versionId, quoteReference: quoteId, customAsset: null } }], shipment: orderState === "delivered" ? { carrier: "canada-post", trackingReference: "DEMO TRACK 10001", trackingUrl: "https://www.canadapost-postescanada.ca/track-reperage/en#/details/DEMOTRACK10001", shippedAt: "2026-08-29T12:00:00Z", deliveredAt: "2026-08-30T12:00:00Z" } : null, shippingAddress: null, timeline: [{ action: "checkout_created", fromState: null, toState: "payment_pending", data: {}, createdAt: "2026-08-28T12:00:00Z" }, ...(paid ? [{ action: "payment_verified", fromState: "payment_pending", toState: "paid", data: {}, createdAt: "2026-08-28T12:01:00Z" }] : [])] });
  const context = await browser.newContext();
  await context.addInitScript((value) => sessionStorage.setItem("sewncovers.session-token", value), customerToken);
  await context.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname; const method = request.method(); const authorization = request.headers().authorization ?? ""; const isAdmin = authorization.endsWith(adminToken);
    if (method === "OPTIONS") return route.fulfill({ headers: corsHeaders, status: 204 });
    if (path === "/account") return json(route, { email: isAdmin ? "operations@example.invalid" : "customer@example.invalid", createdAt: "2026-08-28T00:00:00Z", role: isAdmin ? "administrator" : "customer" });
    if (path === "/account/sessions") return json(route, [{ id: 1, createdAt: "2026-08-28T00:00:00Z", expiresAt: expiry, revokedAt: null, current: true }]);
    if (path === "/projects" && method === "GET") return json(route, [{ id: projectId, name: "Fictional patio sample", versionCount: 1, updatedAt: "2026-08-28T12:00:00Z", privacy: "private" }]);
    if (path === `/projects/${projectId}`) return json(route, { id: projectId, name: "Fictional patio sample", versionCount: 1, updatedAt: "2026-08-28T12:00:00Z", privacy: "private", createdAt: "2026-08-28T12:00:00Z", currentVersion: { id: versionId, versionNumber: 1, configuration, createdAt: "2026-08-28T12:00:00Z", isCurrent: true }, activeShares: [] });
    if (path === "/commerce/pricing/preview") return json(route, pricing);
    if (path === "/commerce/quotes" && method === "GET") return json(route, quoted ? [quote] : []);
    if (path === "/commerce/quotes" && method === "POST") { quoted = true; return json(route, quote, 201); }
    if (path === "/commerce/cart" && method === "GET") return json(route, { id: cartId, demonstration: true, state: "active", currency: "CAD", lines: inCart ? [{ id: lineId, quote: { ...quote, quantity, subtotalAmountMinor: 10450 * quantity, subtotalFormatted: `$${(104.5 * quantity).toFixed(2)} CAD` }, quantity, extendedAmountMinor: 10450 * quantity }] : [], subtotalAmountMinor: inCart ? 10450 * quantity : 0, subtotalFormatted: `$${(inCart ? 104.5 * quantity : 0).toFixed(2)} CAD`, notices: [] });
    if (path === "/commerce/cart/lines" && method === "POST") { inCart = true; return json(route, { id: cartId, demonstration: true, state: "active", currency: "CAD", lines: [{ id: lineId, quote, quantity: 1, extendedAmountMinor: 10450 }], subtotalAmountMinor: 10450, subtotalFormatted: "$104.50 CAD", notices: [] }); }
    if (path === `/commerce/cart/lines/${lineId}` && method === "PATCH") { quantity = request.postDataJSON().quantity; return json(route, { id: cartId, demonstration: true, state: "active", currency: "CAD", lines: [{ id: lineId, quote: { ...quote, quantity, subtotalAmountMinor: 10450 * quantity, subtotalFormatted: `$${(104.5 * quantity).toFixed(2)} CAD` }, quantity, extendedAmountMinor: 10450 * quantity }], subtotalAmountMinor: 10450 * quantity, subtotalFormatted: `$${(104.5 * quantity).toFixed(2)} CAD`, notices: ["Quantity changed using a new immutable quote."] }); }
    if (path === "/commerce/checkout") return json(route, { demonstration: true, orderId, orderReference: "SC-DEMO-ORDER0001", checkoutUrl: `${appOrigin}${basePath}/checkout/sandbox/?session=${attemptSession}&order=${orderId}`, expiresAt: expiry }, 201);
    if (path === `/commerce/sandbox/checkouts/${attemptSession}` && method === "GET") return json(route, { demonstration: true, sessionId: attemptSession, orderReference: "SC-DEMO-ORDER0001", amountMinor: 10450 * quantity, currency: "CAD", status: paid ? "paid" : "pending", expiresAt: expiry });
    if (path.endsWith("/complete")) { paid = true; orderState = "paid"; paymentStatus = "paid"; return json(route, { received: true, duplicate: false, outcome: "paid" }); }
    if (path === "/commerce/orders" && method === "GET") return json(route, [order()]);
    if (path === `/commerce/orders/${orderId}`) return json(route, order());
    if (path === "/admin/orders" && isAdmin) return json(route, [order()]);
    if (path === `/admin/orders/${orderId}` && isAdmin && method === "GET") return json(route, order());
    if (path.endsWith("/transition") && isAdmin) { orderState = request.postDataJSON().targetState; return json(route, order()); }
    if (path.endsWith("/shipment") && isAdmin) { orderState = "delivered"; return json(route, order()); }
    if (path.endsWith("/refund") && isAdmin) { orderState = "refunded"; paymentStatus = "refunded"; return json(route, order()); }
    if (path === "/admin/price-books" && isAdmin) return json(route, [{ id: priceBookId, version: 1, label: "Demonstration CAD price model v1", state: "published", currency: "CAD", configuration: { model: "demonstration-price-v1" }, effectiveAt: "2026-08-28T00:00:00Z", createdAt: "2026-08-28T00:00:00Z", publishedAt: "2026-08-28T00:00:00Z" }]);
    if (path === "/admin/audit" && isAdmin) return json(route, [{ id: 1, actorAccountId: "A".repeat(22), action: "order.transition", targetType: "order", targetId: orderId, data: {}, createdAt: "2026-08-28T12:02:00Z" }]);
    return json(route, { errors: [{ code: "resource_not_found", message: "Not found.", location: ["path"] }] }, 404);
  });

  const page = await context.newPage();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${basePath}/commerce/`);
  await expect(page.getByRole("heading", { name: "Price an immutable project version" })).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button", { name: "Preview price" }).press("Enter");
  await expect(page.getByRole("heading", { name: /Estimated subtotal: \$104.50 CAD/ })).toBeVisible();
  await page.getByRole("button", { name: "Create quote" }).press("Enter");
  await page.getByRole("button", { name: "Add to cart" }).press("Enter");
  await page.getByRole("link", { name: "Cart" }).press("Enter");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole("spinbutton", { name: "Quantity" }).fill("2");
  await page.getByRole("button", { name: "Update" }).press("Enter");
  await expect(page.getByText("$209.00 CAD").first()).toBeVisible();
  await page.getByRole("button", { name: "Continue to hosted sandbox checkout" }).press("Enter");
  await expect(page.getByRole("heading", { name: "SC-DEMO-ORDER0001" })).toBeVisible();
  await expect(page.getByText(/no card fields/i)).toBeVisible();
  await page.getByRole("button", { name: "Submit fictional successful payment" }).press("Enter");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByText(/only a verified payment event/i)).toBeVisible();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await noOverflow(page);
  await page.getByRole("link", { name: "Admin" }).press("Enter");
  await expect(page.getByRole("heading", { name: "Administrator access denied" })).toBeVisible();

  const adminPage = await context.newPage();
  await adminPage.addInitScript((value) => sessionStorage.setItem("sewncovers.session-token", value), adminToken);
  await adminPage.goto(`${basePath}/admin/`);
  await expect(adminPage.getByRole("heading", { name: "Paid-order manufacturing queue" })).toBeVisible();
  await adminPage.getByRole("button", { name: "Review specification" }).press("Enter");
  await expect(adminPage.getByRole("heading", { name: "Immutable production specifications" })).toBeVisible();
  await noOverflow(adminPage);
  await context.close();
});
