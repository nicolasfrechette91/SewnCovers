import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";

import Home from "../app/page";

afterEach(cleanup);

test("renders the hero CTA hierarchy with semantic destinations", () => {
  render(<Home />);

  const hero = screen.getByRole("region", {
    name: /Plan a replacement cover around your cushion's real measurements/i,
  });
  const actions = hero.querySelector<HTMLElement>(".landing-hero-actions");
  assert.ok(actions);
  const links = within(actions).getAllByRole("link");

  assert.deepEqual(
    links.map((link) => link.textContent?.trim()),
    [
      "Start configuring",
      "Explore cover examples",
      "See how the idea works",
    ],
  );
  assert.equal(links[0].tagName, "A");
  assert.equal(links[0].getAttribute("href"), "/configure");
  assert.equal(links[1].getAttribute("href"), "#examples");
  assert.equal(links[2].getAttribute("href"), "#how-it-works");
  assert.equal(document.getElementById("examples")?.tagName, "SECTION");
  assert.equal(document.getElementById("how-it-works")?.tagName, "SECTION");
});

test("preserves the hero prototype disclosure", () => {
  render(<Home />);

  const status = screen.getByRole("complementary", {
    name: "Prototype status",
  });
  assert.match(
    status.textContent ?? "",
    /cannot charge money, create a real shipment, or produce finished covers/i,
  );
  const details = within(status).getByRole("link", {
    name: "View prototype details",
  });
  assert.equal(details.getAttribute("href"), "/trust");
});
