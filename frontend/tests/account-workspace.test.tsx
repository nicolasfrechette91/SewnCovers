import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { AccountScreen } from "../components/account";
import { PrivateProjectPanel } from "../components/configurator/private-project-panel";
import { ConfigurationReadonly } from "../components/projects";
import { AuthProvider, useAuth } from "../context/auth";
import type { CreateDesignRequest } from "../services/api-client";
import {
  buildProjectShareUrl,
  readSessionToken,
  removeSessionToken,
  storeSessionToken,
  withBasePath,
} from "../services/account-api";

const configuration: CreateDesignRequest = {
  shape: "tapered",
  width: 73.25,
  height: 49.75,
  backWidth: 61.5,
  thickness: 13.5,
  unit: "cm",
  patternId: "terrace-wave",
  patternScale: 1.6,
  materialId: "linen-blend",
  fitPreference: "relaxed",
  closureType: "envelope",
  seamStyle: "piped",
};

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

function AuthProbe() {
  const { state } = useAuth();
  return <span data-testid="auth-state">{state.status}</span>;
}

test("restores the optional guest journey without creating browser records", async () => {
  render(<AuthProvider><AuthProbe /></AuthProvider>);
  await waitFor(() => assert.equal(screen.getByTestId("auth-state").textContent, "guest"));
  assert.equal(readSessionToken(), null);
  assert.equal(window.localStorage.length, 0);
});

test("keeps opaque authentication only in sessionStorage", () => {
  const token = "A".repeat(43);
  storeSessionToken(token);
  assert.equal(readSessionToken(), token);
  assert.equal(window.sessionStorage.length, 1);
  assert.equal(window.localStorage.length, 0);
  assert.equal(window.location.href.includes(token), false);
  removeSessionToken();
  assert.equal(readSessionToken(), null);
});

test("renders native sign-in and registration forms with documented limits", async () => {
  render(<AuthProvider><AccountScreen /></AuthProvider>);
  await screen.findByRole("heading", { name: "Sign in" });
  assert.ok(screen.getByRole("heading", { name: "Create an account" }));
  const passphrases = screen.getAllByLabelText("Passphrase") as HTMLInputElement[];
  assert.equal(passphrases.length, 2);
  assert.ok(passphrases.every((input) => input.minLength === 12 && input.maxLength === 128));
  assert.ok(screen.getByText(/Email verification and password recovery are not available/));
});

test("distinguishes private project saving from anonymous immutable sharing", async () => {
  render(<AuthProvider><PrivateProjectPanel configuration={configuration} onSavingChange={() => undefined} /></AuthProvider>);
  await screen.findByRole("heading", { name: "Save to a private project" });
  await screen.findByRole("link", { name: "Sign in or register" });
  assert.ok(screen.getByText(/Accounts are optional/));
  assert.ok(screen.getByRole("link", { name: "Sign in or register" }));
  assert.ok(screen.getByText(/anonymous public design link/));
});

test("shows every Task 10.1 field in a read-only version summary", () => {
  render(<ConfigurationReadonly configuration={configuration} />);
  for (const value of [
    "tapered", "73.25 cm", "49.75 cm", "61.5 cm", "13.5 cm",
    "Linen blend", "More relaxed fit", "Envelope opening", "Piped edge",
    "terrace-wave", "1.6×",
  ]) assert.ok(screen.getByText(value));
  assert.ok(screen.getByText(/Read-only preview/));
});

test("builds root-safe bearer share routes without account identifiers", () => {
  const token = "B".repeat(43);
  assert.equal(withBasePath("/projects/"), "/projects/");
  const url = buildProjectShareUrl(token);
  assert.equal(url, `https://example.test/configure/?share=${token}`);
  assert.equal(url.includes("account"), false);
  assert.equal(url.includes("email"), false);
});
