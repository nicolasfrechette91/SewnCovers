import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";

import { OrderCard } from "../components/commerce/orders-screen";
import { statusLabel } from "../components/commerce/status-label";
import type { Order } from "../services/commerce-api";

// How the order card shows carriers and states: each carrier by its name
// (D14), and a state, payment status or carrier this build does not know
// with a neutral label, while the rest of the card keeps working.

afterEach(() => {
  cleanup();
});

const order: Order = {
  id: "O".repeat(22),
  reference: "SC-DEMO-ORDER0001",
  demonstration: true,
  createdAt: "2026-08-28T12:00:00Z",
  state: "shipped",
  paymentStatus: "paid",
  currency: "CAD",
  subtotalAmountMinor: 10450,
  taxAmountMinor: 1515,
  shippingAmountMinor: 1200,
  totalAmountMinor: 13165,
  totalFormatted: "$131.65 CAD",
  lines: [],
  shipment: {
    carrier: "canada-post",
    trackingReference: "DEMOTRACK",
    trackingUrl: "https://www.canadapost-postescanada.ca/track/DEMOTRACK",
    shippedAt: "2026-08-29T12:00:00Z",
    deliveredAt: null,
  },
  shippingAddress: null,
  timeline: [],
};

test("statuses read as words, and an unknown one says so", () => {
  assert.equal(statusLabel("ready_to_ship"), "Ready to ship");
  assert.equal(statusLabel("paid"), "Paid");
  assert.equal(statusLabel("unknown"), "Unknown status");
});

test("the shipment line names the carrier as people know it", () => {
  for (const [carrier, name] of [
    ["canada-post", "Canada Post"],
    ["ups", "UPS"],
    ["fedex", "FedEx"],
    ["purolator", "Purolator"],
  ] as const) {
    render(
      <OrderCard
        order={{ ...order, shipment: { ...order.shipment!, carrier } }}
        detail
      />,
    );
    assert.ok(screen.getByText(`${name} · DEMOTRACK`));
    cleanup();
  }
});

test("an order with values this build does not know still shows, with neutral labels", () => {
  render(
    <OrderCard
      order={{
        ...order,
        state: "unknown",
        paymentStatus: "unknown",
        shipment: { ...order.shipment!, carrier: "unknown" },
      }}
      detail
    />,
  );

  assert.equal(screen.getAllByText("Unknown status").length, 2);
  assert.ok(screen.getByText("Unknown carrier · DEMOTRACK"));
  assert.ok(screen.getByText("$131.65 CAD"));
  assert.ok(
    screen.getByRole("link", { name: "Track on carrier website" }),
    "the tracking link is still checked against known carrier sites",
  );
});
