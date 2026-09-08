import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AdminScreen, CartScreen } from "../components/commerce";
import { SignInForCommerce } from "../components/commerce/demo-banner";
import { OrderCard } from "../components/commerce/orders-screen";
import { AuthProvider } from "../context/auth";
import { storeSessionToken } from "../services/account-api";
import type { Order } from "../services/commerce-api";

const token = "C".repeat(43);

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

const pricing = {
  demonstration: true, modelLabel: "Demonstration CAD price model v1", priceBookVersion: 1,
  currency: "CAD", quantity: 1, unitAmountMinor: 10450, subtotalAmountMinor: 10450,
  subtotalFormatted: "$104.50 CAD", breakdown: [{ code: "shape-base", label: "Shape base", amountMinor: 8000, basis: "box" }],
  taxTreatment: "Tax is calculated by the hosted checkout provider.", shippingTreatment: "Shipping is calculated by the hosted checkout provider.",
} as const;
const quote = {
  ...pricing, id: "Q".repeat(22), status: "active", projectVersionId: "V".repeat(22),
  configuration: { shape: "box" }, createdAt: "2026-08-28T12:00:00Z", expiresAt: "2026-09-04T12:00:00Z",
  canCheckout: true, customAsset: null,
} as const;
const cart = {
  id: "K".repeat(22), demonstration: true, state: "active", currency: "CAD",
  lines: [{ id: "L".repeat(22), quote, quantity: 1, extendedAmountMinor: 10450 }],
  subtotalAmountMinor: 10450, subtotalFormatted: "$104.50 CAD", notices: [],
} as const;
const order: Order = {
  id: "O".repeat(22), reference: "SC-DEMO-ORDER0001", demonstration: true,
  createdAt: "2026-08-28T12:00:00Z", state: "ready_to_ship", paymentStatus: "paid", currency: "CAD",
  subtotalAmountMinor: 10450, taxAmountMinor: 1515, shippingAmountMinor: 1200,
  totalAmountMinor: 13165, totalFormatted: "$131.65 CAD",
  lines: [{ quoteId: "Q".repeat(22), quantity: 1, extendedAmountMinor: 10450, configuration: { shape: "box", materialId: "linen-blend", fitPreference: "relaxed", closureType: "zipper", seamStyle: "piped" }, productionSpecification: { shape: "box", measurements: { width: "70", height: "50", thickness: "12", unit: "cm" }, material: "linen-blend", fit: "relaxed", closureAccess: "zipper", edgeFinish: "piped", patternScale: "1.2", configurationVersionReference: "V".repeat(22), quoteReference: "Q".repeat(22), customAsset: null } }],
  shipment: { carrier: "canada-post", trackingReference: "DEMO TRACK 10001", trackingUrl: "https://www.canadapost-postescanada.ca/track-reperage/en#/details/DEMOTRACK10001", shippedAt: "2026-08-29T12:00:00Z", deliveredAt: null },
  shippingAddress: null,
  timeline: [{ action: "payment_verified", fromState: "payment_pending", toState: "paid", data: {}, createdAt: "2026-08-28T12:01:00Z" }],
};

afterEach(() => { cleanup(); window.sessionStorage.clear(); });

function mockAccount(role: "customer" | "administrator", handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/account")) return json({ email: `${role}@example.invalid`, createdAt: "2026-08-28T00:00:00Z", role });
    if (url.endsWith("/account/sessions")) return json([{ id: 1, createdAt: "2026-08-28T00:00:00Z", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), revokedAt: null, current: true }]);
    return handler(url, init);
  };
  storeSessionToken(token);
}

test("labels the cart as a sandbox and changes quantity through a replacement quote", async () => {
  const requests: string[] = [];
  mockAccount("customer", (url, init) => {
    requests.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith("/commerce/cart")) return json(cart);
    if (url.includes(`/commerce/cart/lines/${"L".repeat(22)}`)) return json({ ...cart, lines: [{ ...cart.lines[0], quantity: 2, quote: { ...quote, quantity: 2, subtotalAmountMinor: 20900, subtotalFormatted: "$209.00 CAD" }, extendedAmountMinor: 20900 }], subtotalAmountMinor: 20900, subtotalFormatted: "$209.00 CAD", notices: ["Quantity changed and a new quote was created."] });
    return json({ errors: [{ code: "missing", message: "Missing" }] }, 404);
  });
  render(<AuthProvider><CartScreen /></AuthProvider>);
  await screen.findByRole("heading", { name: "$104.50 CAD" });
  assert.ok(screen.getByText(/Sandbox demonstration/));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Quantity" }), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Update" }));
  await screen.findByRole("heading", { name: "$209.00 CAD" });
  assert.ok(requests.some((request) => request.startsWith("PATCH") && request.includes("/commerce/cart/lines/")));
  assert.equal(screen.getAllByText(/new quote was created/).length, 2);
});

test("keeps the fictional-commerce warning visible when sign-in is required", () => {
  render(<SignInForCommerce />);
  assert.ok(screen.getByText(/Fictional CAD prices and payment events only/));
  assert.ok(screen.getByText(/No live charge, tax, shipment, or production service/));
  assert.ok(screen.getByRole("heading", { name: "Sign in to use demonstration pricing" }));
  assert.ok(screen.getByText(/complete configurator and existing public-sharing flow/));
  assert.ok(screen.getByRole("link", { name: "Sign in" }));
  assert.ok(screen.getByRole("link", { name: "Create account" }));
  assert.ok(screen.getByRole("link", { name: "Start a guest design" }));
});

test("denies the administrator workspace to a customer role", async () => {
  mockAccount("customer", () => json({ errors: [] }, 404));
  render(<AuthProvider><AdminScreen /></AuthProvider>);
  await screen.findByRole("heading", { name: "Administrator access denied" });
  assert.ok(screen.getByText(/browser requests cannot grant administrative access/));
});

test("loads the protected price-book, queue, specification, and audit workflow for an administrator", async () => {
  mockAccount("administrator", (url) => {
    if (url.endsWith("/admin/orders")) return json([order]);
    if (url.endsWith(`/admin/orders/${order.id}`)) return json(order);
    if (url.endsWith("/admin/price-books")) return json([{ id: "B".repeat(22), version: 1, label: "Demonstration CAD price model v1", state: "published", currency: "CAD", configuration: { model: "demonstration-price-v1" }, effectiveAt: "2026-08-28T00:00:00Z", createdAt: "2026-08-28T00:00:00Z", publishedAt: "2026-08-28T00:00:00Z" }]);
    if (url.endsWith("/admin/audit")) return json([{ id: 1, actorAccountId: "A".repeat(22), action: "order.transition", targetType: "order", targetId: order.id, data: { to: "ready_to_ship" }, createdAt: "2026-08-28T12:02:00Z" }]);
    return json({ errors: [{ code: "missing", message: "Missing" }] }, 404);
  });
  render(<AuthProvider><AdminScreen /></AuthProvider>);
  await screen.findByText(order.reference);
  assert.ok(screen.getByText(/Demonstration CAD price model v1/));
  fireEvent.click(screen.getByRole("button", { name: "Review specification" }));
  await screen.findByRole("heading", { name: "Immutable production specifications" });
  assert.ok(screen.getByText(/70 × 50 × 12 cm/));
  assert.ok(screen.getByText("order.transition"));
  assert.ok(screen.getByRole("button", { name: "Review refund" }));
});

test("renders an authoritative customer financial summary and allowlisted tracking link", () => {
  render(<OrderCard order={order} detail />);
  assert.ok(screen.getByRole("heading", { name: order.reference }));
  assert.ok(screen.getByText("$131.65 CAD"));
  assert.ok(screen.getByRole("heading", { name: "Manufacturing and fulfilment timeline" }));
  const link = screen.getByRole("link", { name: "Track on carrier website" }) as HTMLAnchorElement;
  assert.ok(link.href.startsWith("https://www.canadapost-postescanada.ca/"));
});

test("does not create an executable link for a non-allowlisted tracking URL", () => {
  render(<OrderCard order={{ ...order, shipment: { ...order.shipment!, trackingUrl: "javascript:alert(1)" } }} detail />);
  assert.equal(screen.queryByRole("link", { name: "Track on carrier website" }), null);
  assert.ok(screen.getByText(/DEMO TRACK 10001/));
});
