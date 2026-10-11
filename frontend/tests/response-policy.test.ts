import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { AccountApiError, accountApi } from "../services/account-api";
import { assuranceApi } from "../services/assurance-api";
import { commerceApi } from "../services/commerce-api";

// "Tolerant reader, strict values" (docs/architecture.md):
//   - a field this build does not know is ignored and never passed on;
//   - a missing or wrong known field makes the response malformed;
//   - an unknown value that drives logic (role, shape, cart or price-book
//     state, privacy, upload method, image type) is malformed;
//   - an unknown value that is only shown (order, payment, upload,
//     moderation and quote states, carriers, readiness levels) reads as
//     "unknown", and the screens show a neutral label.

// Fixture values only; they are never printed.
const TOKEN = "P".repeat(43);
const date = "2026-08-28T12:00:00Z";
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function answer(body: unknown): void {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
}

async function malformed(call: () => Promise<unknown>): Promise<void> {
  await assert.rejects(
    call(),
    (error) =>
      error instanceof AccountApiError && error.code === "malformed_response",
  );
}

const configuration = {
  shape: "box",
  width: 73.25,
  height: 49.75,
  backWidth: null,
  thickness: 13.5,
  unit: "cm",
  pattern: { kind: "built-in", patternId: "terrace-wave" },
  patternScale: 1.6,
  materialId: "linen-blend",
  fitPreference: "relaxed",
  closureType: "envelope",
  seamStyle: "piped",
};
const version = {
  id: "V".repeat(22),
  versionNumber: 1,
  configuration,
  createdAt: date,
  isCurrent: true,
};
const project = {
  id: "R".repeat(22),
  name: "Patio bench",
  versionCount: 1,
  updatedAt: date,
  privacy: "private",
  createdAt: date,
  currentVersion: version,
  activeShares: [],
};
const upload = {
  id: "U".repeat(22),
  label: "Garden repeat",
  state: "approved",
  moderationState: "approved",
  contentType: "image/png",
  byteSize: 100,
  width: 128,
  height: 96,
  processingVersion: "tile-v1",
  tileDerivativeId: "T".repeat(22),
  thumbnailDerivativeId: null,
  processingAttempts: 0,
  moderationAttempts: 0,
  retryEligible: false,
  referencedByVersions: 0,
  createdAt: date,
  updatedAt: date,
  deletedAt: null,
};
const quote = {
  id: "Q".repeat(22),
  demonstration: true,
  status: "active",
  modelLabel: "Demonstration CAD price model v1",
  priceBookVersion: 1,
  currency: "CAD",
  quantity: 1,
  unitAmountMinor: 10450,
  subtotalAmountMinor: 10450,
  subtotalFormatted: "$104.50 CAD",
  breakdown: [
    { code: "base", label: "Base", amountMinor: 10450, basis: "box" },
  ],
  taxTreatment: "Fictional tax.",
  shippingTreatment: "Fictional shipping.",
  projectVersionId: null,
  configuration: { shape: "box" },
  createdAt: date,
  expiresAt: date,
  canCheckout: true,
  customAsset: null,
};
const cart = {
  id: "K".repeat(22),
  demonstration: true,
  state: "active",
  currency: "CAD",
  lines: [
    { id: "L".repeat(22), quote, quantity: 1, extendedAmountMinor: 10450 },
  ],
  subtotalAmountMinor: 10450,
  subtotalFormatted: "$104.50 CAD",
  notices: [],
};
const order = {
  id: "O".repeat(22),
  reference: "SC-DEMO-ORDER0001",
  demonstration: true,
  createdAt: date,
  state: "shipped",
  paymentStatus: "paid",
  currency: "CAD",
  subtotalAmountMinor: 10450,
  taxAmountMinor: 0,
  shippingAmountMinor: 0,
  totalAmountMinor: 10450,
  totalFormatted: "$104.50 CAD",
  lines: [{ quoteId: quote.id }],
  shipment: {
    carrier: "canada-post",
    trackingReference: "TRACK",
    trackingUrl: null,
    shippedAt: date,
    deliveredAt: null,
  },
  shippingAddress: null,
  timeline: [],
};
const priceBook = {
  id: "B".repeat(22),
  version: 1,
  label: "Demonstration prices",
  state: "published",
  currency: "CAD",
  configuration: { model: "demonstration-price-v1" },
  effectiveAt: null,
  createdAt: date,
  publishedAt: date,
};
const work = {
  id: "W".repeat(22),
  orderReference: "SC-DEMO-WORK0001",
  lineIndex: 0,
  state: "review",
  qualityState: "pending",
  revision: 1,
  specification: { shape: "box" },
  checklist: [],
  issues: [],
  history: [],
  demonstration: true,
};

test("account responses: new fields are ignored and never passed on", async () => {
  answer({
    email: "a@example.invalid",
    createdAt: date,
    role: "customer",
    displayName: "new field",
  });
  assert.deepEqual(await accountApi.current(TOKEN), {
    email: "a@example.invalid",
    createdAt: date,
    role: "customer",
  });

  answer({
    ...project,
    colour: "new",
    currentVersion: {
      ...version,
      note: "new",
      configuration: {
        ...configuration,
        pipingColour: "new",
        pattern: { ...configuration.pattern, density: 2 },
      },
    },
  });
  assert.deepEqual(await accountApi.getProject(TOKEN, project.id), project);

  answer([{ ...upload, checksum: "new" }]);
  assert.deepEqual(await accountApi.listUploads(TOKEN), [upload]);
});

test("account responses: logic values this build does not know are malformed", async () => {
  answer({ email: "a@example.invalid", createdAt: date, role: "owner" });
  await malformed(() => accountApi.current(TOKEN));

  answer({ ...project, privacy: "public" });
  await malformed(() => accountApi.getProject(TOKEN, project.id));

  answer({
    ...project,
    currentVersion: {
      ...version,
      configuration: { ...configuration, shape: "hexagon" },
    },
  });
  await malformed(() => accountApi.getProject(TOKEN, project.id));

  answer({ url: "/asset", expiresAt: date, contentType: "image/jpeg" });
  await malformed(() => accountApi.assetAccess(TOKEN, upload.id, "tile"));

  // A known field that is missing (here the email).
  answer({ createdAt: date, role: "customer" });
  await malformed(() => accountApi.current(TOKEN));
});

test("upload states that are only shown read as unknown when new", async () => {
  answer([{ ...upload, state: "quarantined", moderationState: "escalated" }]);
  const [read] = await accountApi.listUploads(TOKEN);
  assert.equal(read.state, "unknown");
  assert.equal(read.moderationState, "unknown");

  answer([{ ...upload, state: 42 }]);
  await malformed(() => accountApi.listUploads(TOKEN));
});

test("commerce responses: new fields are ignored, logic values stay strict", async () => {
  answer({ ...cart, giftWrap: true, lines: [{ ...cart.lines[0], note: "x" }] });
  assert.deepEqual(await commerceApi.cart(TOKEN), cart);

  answer([{ ...priceBook, region: "CA" }]);
  assert.deepEqual(await commerceApi.priceBooks(TOKEN), [priceBook]);

  answer({ ...cart, state: "frozen" });
  await malformed(() => commerceApi.cart(TOKEN));

  answer([{ ...priceBook, state: "archived" }]);
  await malformed(() => commerceApi.priceBooks(TOKEN));

  answer({ ...cart, currency: "USD" });
  await malformed(() => commerceApi.cart(TOKEN));
});

test("commerce values that are only shown read as unknown when new", async () => {
  answer({
    ...order,
    state: "on_hold",
    paymentStatus: "disputed",
    shipment: { ...order.shipment, carrier: "dhl" },
    insurance: "new field",
  });
  const read = await commerceApi.order(TOKEN, order.id);
  assert.equal(read.state, "unknown");
  assert.equal(read.paymentStatus, "unknown");
  assert.equal(read.shipment?.carrier, "unknown");
  assert.equal(Object.hasOwn(read, "insurance"), false);

  answer([{ ...quote, status: "superseded" }]);
  const [readQuote] = await commerceApi.quotes(TOKEN);
  assert.equal(readQuote.status, "unknown");

  answer({ ...order, state: 7 });
  await malformed(() => commerceApi.order(TOKEN, order.id));
});

test("assurance responses: new fields are ignored, shown levels read as unknown", async () => {
  answer({
    items: [{ ...work, priority: "high" }],
    page: 1,
    pageSize: 20,
    total: 1,
    facets: {},
  });
  assert.deepEqual(await assuranceApi.productionQueue(TOKEN), {
    items: [work],
    page: 1,
    pageSize: 20,
    total: 1,
  });

  answer({
    ready: true,
    checks: [{ code: "contact", level: "notice", message: "Fine." }],
    disclaimer: "Not an audit.",
  });
  assert.deepEqual(await assuranceApi.readiness(), {
    ready: true,
    checks: [{ code: "contact", level: "unknown", message: "Fine." }],
    disclaimer: "Not an audit.",
  });

  answer({ ...work, demonstration: false });
  await malformed(() => assuranceApi.work(TOKEN, work.id));
});
