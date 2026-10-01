import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";

import Home from "../app/page";
import { cushionShapeDefinitions } from "../data/shapes";

afterEach(cleanup);

function hero() {
  return screen.getByRole("region", {
    name: "Design a cover that fits the cushion you already have.",
  });
}

test("gives the hero one action that starts configuring", () => {
  render(<Home />);

  const links = within(hero()).getAllByRole("link");
  assert.deepEqual(
    links.map((link) => link.textContent?.trim()),
    ["Start configuring"],
  );
  assert.equal(links[0].tagName, "A");
  assert.equal(links[0].getAttribute("href"), "/configure");
});

test("sends every page action to the configurator, with no in-page loops", () => {
  const { container } = render(<Home />);

  const links = Array.from(container.querySelectorAll("a"));
  assert.deepEqual(
    links.map((link) => [link.textContent?.trim(), link.getAttribute("href")]),
    [
      ["Start configuring", "/configure"],
      ["Start configuring", "/configure"],
    ],
  );
  assert.equal(
    within(
      screen.getByRole("region", { name: "Ready with a tape measure?" }),
    ).getByRole("link").textContent,
    "Start configuring",
  );
});

test("keeps one h1 and an ordered heading outline", () => {
  const { container } = render(<Home />);

  assert.deepEqual(
    Array.from(container.querySelectorAll("h1, h2, h3, h4"), (heading) => [
      heading.tagName,
      heading.textContent,
    ]),
    [
      ["H1", "Design a cover that fits the cushion you already have."],
      ["H2", "How it works"],
      ["H2", "Five cushion shapes"],
      ["H2", "Prototype"],
      ["H2", "Ready with a tape measure?"],
    ],
  );
});

test("lists three one-line steps that each start with a verb", () => {
  render(<Home />);

  const steps = within(
    screen.getByRole("region", { name: "How it works" }),
  ).getAllByRole("listitem");
  assert.deepEqual(
    steps.map((step) => step.querySelector("p")?.textContent),
    [
      "Pick the shape that matches your cushion.",
      "Enter its measurements, with a diagram to guide you.",
      "Choose fabric and a pattern, then preview, save or share.",
    ],
  );
});

test("shows every supported shape with its configurator icon", () => {
  render(<Home />);

  const items = within(
    screen.getByRole("region", { name: "Five cushion shapes" }),
  ).getAllByRole("listitem");
  assert.equal(cushionShapeDefinitions.length, 5);
  assert.deepEqual(
    items.map((item) => item.textContent),
    cushionShapeDefinitions.map((shape) => shape.name),
  );
  for (const item of items) {
    assert.ok(item.querySelector('svg.shape-illustration[aria-hidden="true"]'));
  }
});

test("states the prototype disclaimer once", () => {
  const { container } = render(<Home />);

  const notices = screen.getAllByRole("complementary");
  assert.equal(notices.length, 1);
  assert.equal(
    within(notices[0]).getByRole("heading").textContent,
    "Prototype",
  );
  assert.match(
    notices[0].textContent ?? "",
    /cannot charge money, create a real shipment, or produce finished covers/,
  );
  const outside = container.cloneNode(true) as HTMLElement;
  outside.querySelector("aside")?.remove();
  assert.doesNotMatch(outside.textContent ?? "", /prototype|demo|illustrative/i);
});

test("describes only what the configurator offers", () => {
  const { container } = render(<Home />);

  assert.doesNotMatch(
    container.textContent ?? "",
    /fabric direction|three (?:supported )?shapes/i,
  );
});
