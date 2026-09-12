import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";

import CaseStudyPage from "../app/case-study/page";

afterEach(cleanup);

test("presents a concise, evidence-bounded portfolio case study", () => {
  render(<CaseStudyPage />);

  assert.ok(screen.getByRole("heading", { level: 1, name: /A measured path/ }));
  for (const heading of [
    "Planning starts before a product exists.",
    "Configure, preview, review, then choose whether to save.",
    "Boundaries are part of the experience.",
    "Static public delivery with API-owned authority.",
    "Quality is checked at several boundaries.",
    "Demonstrated behavior is not commercial readiness.",
    "Explore the work",
  ]) {
    assert.ok(screen.getByRole("heading", { name: heading }));
  }
  assert.match(document.body.textContent ?? "", /not a WCAG conformance claim/i);
  assert.match(document.body.textContent ?? "", /cannot manufacture or ship/i);
});

test("links to the prototype, Trust evidence, and verified source safely", () => {
  render(<CaseStudyPage />);

  assert.equal(
    screen.getByRole("link", { name: "Explore the configurator" }).getAttribute("href"),
    "/configure",
  );
  assert.equal(
    screen.getAllByRole("link", { name: /Trust|technical evidence/i }).length,
    2,
  );
  const source = screen.getByRole("link", { name: /View source repository/ });
  assert.equal(
    source.getAttribute("href"),
    "https://github.com/nicolasfrechette91/SewnCovers",
  );
  assert.equal(source.getAttribute("target"), "_blank");
  assert.equal(source.getAttribute("rel"), "noopener noreferrer");
});
