import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { AuthProvider } from "../context/auth";
import { useAccountResource } from "../context/auth/use-account-resource";
import { storeSessionToken } from "../services/account-api";

// Fixture values only; they are never printed.
const TOKEN = "R".repeat(43);
const originalFetch = globalThis.fetch;

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
}

// Answers the session restore with an account of the given role.
function restoreAs(role: "customer" | "administrator"): void {
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/account")
      return json({
        email: "person@example.invalid",
        createdAt: "2026-08-28T12:00:00Z",
        role,
      });
    return json([
      {
        id: 1,
        createdAt: "2026-08-28T12:00:00Z",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        revokedAt: null,
        current: true,
      },
    ]);
  };
}

let loads: string[] = [];

function Probe({
  role,
  itemKey,
}: Readonly<{ role?: "administrator"; itemKey?: string | null }>) {
  const resource = useAccountResource(
    async (token, signal) => {
      loads.push(`${token === TOKEN ? "token" : "other"}:${itemKey ?? ""}`);
      assert.equal(signal.aborted, false);
      return `loaded ${itemKey ?? "list"}`;
    },
    { role, key: itemKey },
  );
  return (
    <p data-testid="probe">
      {resource.access}|{resource.data ?? ""}|
      {resource.loading ? "loading" : ""}|
      {resource.token === null ? "no token" : "token"}
    </p>
  );
}

const probe = () => screen.getByTestId("probe").textContent;

beforeEach(() => {
  loads = [];
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.sessionStorage.clear();
});

test("asks nothing for a guest", async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

  await waitFor(() => assert.equal(probe(), "guest|||no token"));
  assert.deepEqual(loads, []);
});

test("waits while a stored session is checked, asking nothing", async () => {
  storeSessionToken(TOKEN);
  globalThis.fetch = () => new Promise<Response>(() => undefined);
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

  assert.equal(probe(), "initializing|||no token");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(probe(), "initializing|||no token");
  assert.deepEqual(loads, []);
});

test("loads with the session token once the account is verified", async () => {
  storeSessionToken(TOKEN);
  restoreAs("customer");
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

  await waitFor(() => assert.equal(probe(), "granted|loaded list||token"));
  assert.deepEqual(loads, ["token:"]);
});

test("a session without the required role is forbidden and asks nothing", async () => {
  storeSessionToken(TOKEN);
  restoreAs("customer");
  render(
    <AuthProvider>
      <Probe role="administrator" />
    </AuthProvider>,
  );

  await waitFor(() => assert.equal(probe(), "forbidden|||no token"));
  assert.deepEqual(loads, []);
});

test("an administrator passes the role check", async () => {
  storeSessionToken(TOKEN);
  restoreAs("administrator");
  render(
    <AuthProvider>
      <Probe role="administrator" />
    </AuthProvider>,
  );

  await waitFor(() => assert.equal(probe(), "granted|loaded list||token"));
});

test("a null key waits, and each key loads once", async () => {
  storeSessionToken(TOKEN);
  restoreAs("customer");
  const view = render(
    <AuthProvider>
      <Probe itemKey={null} />
    </AuthProvider>,
  );
  await waitFor(() => assert.equal(probe(), "granted|||token"));
  assert.deepEqual(loads, []);

  view.rerender(
    <AuthProvider>
      <Probe itemKey="first" />
    </AuthProvider>,
  );
  await waitFor(() => assert.equal(probe(), "granted|loaded first||token"));
  view.rerender(
    <AuthProvider>
      <Probe itemKey="second" />
    </AuthProvider>,
  );
  await waitFor(() => assert.equal(probe(), "granted|loaded second||token"));
  assert.deepEqual(loads, ["token:first", "token:second"]);
});
