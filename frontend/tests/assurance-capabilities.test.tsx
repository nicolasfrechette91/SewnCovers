import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";

import { ProductionOperationsScreen } from "../components/assurance/production-operations-screen";
import { AuthProvider } from "../context/auth";
import LegalPage from "../app/legal/page";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

test("renders legal, unauthorized, and review-required surfaces", async () => {
  const legal = render(<LegalPage />);
  assert.ok(
    legal.getByRole("heading", { name: "Legal information" }),
  );
  for (const heading of [
    "Terms of use",
    "Privacy notice",
    "Custom upload and moderation notice",
    "Demonstration commerce and fulfilment notice",
    "Accessibility statement",
    "Security and vulnerability reporting",
  ]) {
    assert.ok(legal.getByRole("heading", { name: heading }));
  }
  cleanup();

  render(
    <AuthProvider>
      <ProductionOperationsScreen />
    </AuthProvider>,
  );
  assert.ok(
    await screen.findByText(/Administrator authorization is required/),
  );
});
