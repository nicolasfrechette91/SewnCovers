import { readdirSync } from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

// Isolated account, commerce and assurance records shared by the specs that
// walk every route (responsive layout, reflow, accessibility structure). No
// real account or commerce service is involved.
export const base = process.env.SEWNCOVERS_GITHUB_PAGES === "true" ? "/SewnCovers" : "";
export const api = "http://api.sewncovers.test";
export const id = "P".repeat(22), versionId = "V".repeat(22), orderId = "O".repeat(22);
export const long = "FictionalPatio".repeat(9);
export const date = "2026-08-28T12:00:00Z";
export const configuration = { shape: "box", width: 73.25, height: 49.75, backWidth: null, thickness: 13.5, unit: "cm", pattern: { kind: "built-in", patternId: "terrace-wave" }, patternScale: 1.6, materialId: "linen-blend", fitPreference: "relaxed", closureType: "envelope", seamStyle: "piped" };
export const version = { id: versionId, versionNumber: 1, configuration, createdAt: date, isCurrent: true };
export const project = { id, name: long, versionCount: 1, updatedAt: date, privacy: "private", createdAt: date, currentVersion: version, activeShares: [] };
export const quote = { id: "Q".repeat(22), demonstration: true, status: "active", modelLabel: "Demonstration CAD price model v1", priceBookVersion: 1, currency: "CAD", quantity: 1, unitAmountMinor: 10450, subtotalAmountMinor: 10450, subtotalFormatted: "$104.50 CAD", breakdown: [], taxTreatment: "Fictional tax.", shippingTreatment: "Fictional shipping.", projectVersionId: versionId, configuration, createdAt: date, expiresAt: date, canCheckout: true, customAsset: null };
export const order = { id: orderId, reference: "SC-DEMO-ORDER0001", demonstration: true, createdAt: date, state: "paid", paymentStatus: "paid", currency: "CAD", subtotalAmountMinor: 10450, taxAmountMinor: 1515, shippingAmountMinor: 1200, totalAmountMinor: 13165, totalFormatted: "$131.65 CAD", lines: [{ quoteId: quote.id, quantity: 1, extendedAmountMinor: 10450, configuration, productionSpecification: { shape: "box", measurements: { width: "73.25", height: "49.75", thickness: "13.5", unit: "cm" }, material: "linen-blend", fit: "relaxed", configurationVersionReference: versionId, quoteReference: quote.id } }], shipment: { carrier: "canada-post", trackingReference: "DEMOTRACK".repeat(4), trackingUrl: null, shippedAt: date, deliveredAt: null }, shippingAddress: null, timeline: [{ action: "payment_verified", fromState: "payment_pending", toState: "paid", data: {}, createdAt: date }] };
export const work = { id: "W".repeat(22), orderReference: "SC-DEMO-WORK0001", lineIndex: 0, state: "review", qualityState: "pending", revision: 1, specification: { shape: "box", checksum: "a".repeat(64), measurements: { width: "80", unit: "cm" } }, checklist: [{ itemKey: "specification_review", status: "pending" }], issues: [], history: [{ action: "created", toState: "review", createdAt: date }], demonstration: true };

// Same isolated records and response shapes as the existing commerce/account/
// assurance journeys, with long labels; no real account or commerce service.
export async function fixtures(page: Page, role: "guest" | "customer" | "administrator", state = "populated") {
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
    if (p === "/uploads") return json([]);
    if (p === "/readiness") return json({ ready: false, checks: [{ code: "contact", level: "error", message: "Production contact remains a placeholder." }], disclaimer: "Not an audit or deployment approval." });
    if (p === "/patterns") return json(["prototype-botanical", "fern-trail", "meadow-sprig", "prototype-geometric", "diamond-path", "arch-grid", "harbor-stripe", "orchard-stripe", "ribbon-stripe", "prototype-woven", "basket-check", "linen-crosshatch", "terrace-wave", "pebble-drift", "confetti-grid"].map((key, i) => ({ id: key, name: key.replaceAll("-", " "), description: `Mock ${key}`, categoryId: ["botanical", "geometric", "striped", "woven", "abstract"][Math.floor(i / 3)], colorIds: ["ivory"], previewClassName: `api-${key}` })));
    if (p.startsWith("/designs/")) return json({ publicId: "AbCdEfGhIjKlMnOpQrStUv", shape: "box", width: 73.25, height: 49.75, backWidth: null, thickness: 13.5, unit: "cm", patternId: "terrace-wave", patternScale: 1.6, materialId: "linen-blend", fitPreference: "relaxed", closureType: "envelope", seamStyle: "piped" });
    if (p.startsWith("/shares/")) return json({ configuration });
    return json({ errors: [{ code: "resource_not_found", message: "Not found.", location: ["path"] }] }, 404);
  });
  return release;
}

export function routes(directory = path.resolve("app"), prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? routes(path.join(directory, entry.name), `${prefix}/${entry.name}`) : entry.name === "page.tsx" ? [`${prefix}/`] : []);
}

export async function geometry(page: Page) {
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

export const corsHeaders = {
  "access-control-allow-origin": "http://127.0.0.1:3100",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "DELETE, GET, PATCH, POST, PUT, OPTIONS",
  "content-type": "application/json",
};

export const uploadId = "U".repeat(22);

/**
 * Turns custom uploads on, with one approved pattern that can be renamed and
 * deleted. Answers are stateful, so a rename or delete shows in the next list.
 * Register after `fixtures`; the later route wins for these paths.
 */
export async function enableUploads(page: Page) {
  let upload: Record<string, unknown> = {
    id: uploadId,
    label: "Garden repeat",
    state: "approved",
    moderationState: "approved",
    contentType: "image/png",
    byteSize: 100,
    width: 128,
    height: 96,
    processingVersion: "tile-v1",
    tileDerivativeId: "T".repeat(22),
    thumbnailDerivativeId: "N".repeat(22),
    processingAttempts: 0,
    moderationAttempts: 0,
    retryEligible: false,
    referencedByVersions: 1,
    createdAt: date,
    updatedAt: date,
    deletedAt: null,
  };
  await page.route(`${api}/uploads**`, async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const json = (body: unknown) =>
      route.fulfill({ body: JSON.stringify(body), headers: corsHeaders });
    if (request.method() === "OPTIONS") return route.fulfill({ headers: corsHeaders, status: 204 });
    if (pathname === "/uploads/availability") return json({ enabled: true });
    if (pathname === "/uploads") return json([upload]);
    if (pathname === `/uploads/${uploadId}` && request.method() === "PATCH") {
      upload = { ...upload, label: (request.postDataJSON() as { label: string }).label };
      return json(upload);
    }
    if (pathname === `/uploads/${uploadId}` && request.method() === "DELETE") {
      upload = { ...upload, state: "deleted", deletedAt: date };
      return json({ id: uploadId, state: "deleted", referencedByVersions: 1 });
    }
    return route.fallback();
  });
}
