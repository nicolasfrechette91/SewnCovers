import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { CartScreen } from "../components/commerce/cart-screen";
import { ProjectsScreen } from "../components/projects/projects-screen";
import { AuthProvider, useAuth } from "../context/auth";
import {
  accountApi,
  readSessionToken,
  storeSessionToken,
} from "../services/account-api";
import { assuranceApi } from "../services/assurance-api";
import { commerceApi } from "../services/commerce-api";
import {
  loadUploadAvailability,
  resetUploadAvailability,
} from "../services/upload-availability";

// The session lifecycle: restoring a stored session on page load, signing in
// and out, a 401 from any client, the page while the session is checked, and
// tabs. Fixture values only; they are never printed.

const STORED = "S".repeat(43);
const SIGNED_IN = "N".repeat(43);
const NOTICE =
  "Your previous sign-in expired or is no longer valid. Sign in again to continue.";
const date = "2026-08-28T12:00:00Z";
const originalFetch = globalThis.fetch;

interface Call {
  readonly method: string;
  readonly path: string;
  readonly authorization: string | null;
}

let calls: Call[] = [];

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function envelope(status: number, code: string): Response {
  return json(
    { errors: [{ code, message: `Fixture ${code}.`, location: ["request"] }] },
    status,
  );
}

const account = {
  email: "person@example.invalid",
  createdAt: date,
  role: "customer",
};

function sessions(overrides: Record<string, unknown> = {}) {
  return [
    {
      id: 1,
      createdAt: date,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      revokedAt: null,
      current: true,
      ...overrides,
    },
  ];
}

type Route = (call: Call) => Response | Promise<Response> | undefined;

// Answers the check of a stored session (unless `route` does) and sign-in.
function serve(route: Route = () => undefined): void {
  globalThis.fetch = async (input, init) => {
    const call = {
      method: init?.method ?? "GET",
      path: new URL(String(input)).pathname,
      authorization: new Headers(init?.headers).get("authorization"),
    };
    calls.push(call);
    const answer = await route(call);
    if (answer) return answer;
    if (call.path === "/account") return json(account);
    if (call.path === "/account/sessions") return json(sessions());
    if (call.path === "/auth/login")
      return json({
        account,
        token: SIGNED_IN,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
    if (call.path === "/auth/logout" || call.path === "/auth/logout-all")
      return new Response(null, { status: 204 });
    throw new Error(`Unexpected ${call.method} ${call.path}`);
  };
}

function Probe() {
  const { state, login, logout, logoutAll, clear } = useAuth();
  return (
    <div>
      <p data-testid="auth">
        {state.status}|
        {state.status === "authenticated" ? state.account.email : ""}|
        {state.status === "guest" ? (state.notice ?? "") : ""}
      </p>
      <button
        onClick={() =>
          void login("person@example.invalid", "x".repeat(12)).catch(
            () => undefined,
          )
        }
      >
        Sign in
      </button>
      <button onClick={() => void logout().catch(() => undefined)}>
        Sign out
      </button>
      <button onClick={() => void logoutAll().catch(() => undefined)}>
        Sign out everywhere
      </button>
      <button onClick={clear}>End this session</button>
    </div>
  );
}

const auth = () => screen.getByTestId("auth").textContent;
const signedIn = `authenticated|${account.email}|`;

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

const checks = (token: string) => [
  { method: "GET", path: "/account", authorization: `Bearer ${token}` },
  {
    method: "GET",
    path: "/account/sessions",
    authorization: `Bearer ${token}`,
  },
];

beforeEach(() => {
  calls = [];
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.sessionStorage.clear();
  window.localStorage.clear();
});

// ---- restoring a session on page load -----------------------------------------
test("a valid stored session is checked, then restored", async () => {
  storeSessionToken(STORED);
  serve();
  renderProbe();
  assert.equal(auth(), "initializing||");

  await waitFor(() => assert.equal(auth(), signedIn));
  assert.deepEqual(calls, checks(STORED));
  assert.equal(readSessionToken(), STORED);
});

const endings: readonly [string, Route][] = [
  [
    "an expired session",
    ({ path }) =>
      path === "/account/sessions"
        ? json(sessions({ expiresAt: "2026-01-01T00:00:00Z" }))
        : undefined,
  ],
  [
    "a revoked session",
    ({ path }) =>
      path === "/account/sessions"
        ? json(sessions({ revokedAt: date }))
        : undefined,
  ],
  [
    "a 401 for the token",
    ({ path }) =>
      path === "/account"
        ? envelope(401, "authentication_required")
        : undefined,
  ],
  [
    "an API that is asleep (503)",
    ({ path }) =>
      path === "/account" ? envelope(503, "storage_unavailable") : undefined,
  ],
  [
    "an API that cannot be reached",
    () => {
      throw new TypeError("Failed to fetch");
    },
  ],
];

for (const [name, route] of endings) {
  test(`${name} ends the stored session, removes the token and says so`, async () => {
    storeSessionToken(STORED);
    serve(route);
    renderProbe();

    await waitFor(() => assert.equal(auth(), `guest||${NOTICE}`));
    assert.equal(readSessionToken(), null);
  });
}

test("without a stored token the visitor is a guest and nothing is asked", async () => {
  serve();
  renderProbe();

  await waitFor(() => assert.equal(auth(), "guest||"));
  assert.deepEqual(calls, []);
});

test("the prerendered page and its hydration show the session as being checked", async () => {
  storeSessionToken(STORED);
  serve();
  const markup = renderToString(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  assert.match(markup, /data-testid="auth">initializing</);
  const container = document.createElement("div");
  container.innerHTML = markup;
  document.body.append(container);
  const errors: unknown[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
      { container, hydrate: true },
    );
    await waitFor(() => assert.equal(auth(), signedIn));
  } finally {
    console.error = originalError;
    container.remove();
  }
  assert.deepEqual(errors, [], "no hydration mismatch");
});

// ---- signing in and out -------------------------------------------------------
test("signing in starts the session without checking it and clears an earlier notice", async () => {
  storeSessionToken(STORED);
  serve(({ path }) =>
    path === "/account" ? envelope(401, "authentication_required") : undefined,
  );
  renderProbe();
  await waitFor(() => assert.equal(auth(), `guest||${NOTICE}`));
  calls = [];

  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => assert.equal(auth(), signedIn));
  assert.deepEqual(calls, [
    { method: "POST", path: "/auth/login", authorization: null },
  ]);
  assert.equal(readSessionToken(), SIGNED_IN);
});

for (const [button, path] of [
  ["Sign out", "/auth/logout"],
  ["Sign out everywhere", "/auth/logout-all"],
] as const) {
  test(`${button} asks the API, removes the token and shows no notice`, async () => {
    storeSessionToken(STORED);
    serve();
    renderProbe();
    await waitFor(() => assert.equal(auth(), signedIn));
    calls = [];

    fireEvent.click(screen.getByRole("button", { name: button }));
    await waitFor(() => assert.equal(auth(), "guest||"));
    assert.deepEqual(calls, [
      { method: "POST", path, authorization: `Bearer ${STORED}` },
    ]);
    assert.equal(readSessionToken(), null);
  });
}

test("signing out ends the session even when the API cannot be reached", async () => {
  storeSessionToken(STORED);
  serve(({ path }) => {
    if (path === "/auth/logout") throw new TypeError("Failed to fetch");
    return undefined;
  });
  renderProbe();
  await waitFor(() => assert.equal(auth(), signedIn));

  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => assert.equal(auth(), "guest||"));
  assert.equal(readSessionToken(), null);
});

// The account screen calls this after revoking the current session (and
// after deleting the account); focus-return.test.tsx drives those buttons.
test("ending this session explicitly removes the token and shows no notice", async () => {
  storeSessionToken(STORED);
  serve();
  renderProbe();
  await waitFor(() => assert.equal(auth(), signedIn));

  fireEvent.click(screen.getByRole("button", { name: "End this session" }));
  await waitFor(() => assert.equal(auth(), "guest||"));
  assert.equal(readSessionToken(), null);
});

test("the session ends with the notice when it expires", async () => {
  storeSessionToken(STORED);
  serve(({ path }) =>
    path === "/account/sessions"
      ? json(sessions({ expiresAt: new Date(Date.now() + 150).toISOString() }))
      : undefined,
  );
  renderProbe();
  await waitFor(() => assert.equal(auth(), signedIn));

  await waitFor(() => assert.equal(auth(), `guest||${NOTICE}`), {
    timeout: 2_000,
  });
  assert.equal(readSessionToken(), null);
});

// ---- a 401 from any client ----------------------------------------------------
const clients = [
  ["account", () => accountApi.listProjects(STORED)],
  ["commerce", () => commerceApi.cart(STORED)],
  ["assurance", () => assuranceApi.productionQueue(STORED)],
] as const;

for (const [name, call] of clients) {
  test(`a 401 from the ${name} client ends the session with the notice`, async () => {
    storeSessionToken(STORED);
    serve(({ path }) =>
      path === "/account" || path === "/account/sessions"
        ? undefined
        : envelope(401, "authentication_required"),
    );
    renderProbe();
    await waitFor(() => assert.equal(auth(), signedIn));

    await act(async () => {
      await call().catch(() => undefined);
    });
    await waitFor(() => assert.equal(auth(), `guest||${NOTICE}`));
    assert.equal(readSessionToken(), null);
  });
}

test("a 401 from the public upload-availability request keeps the session", async () => {
  // An API from before that endpoint was public answers it with 401. The
  // request carries no token, so the answer says nothing about the session.
  storeSessionToken(STORED);
  resetUploadAvailability();
  serve(({ path }) =>
    path === "/uploads/availability"
      ? envelope(401, "authentication_required")
      : undefined,
  );
  renderProbe();
  await waitFor(() => assert.equal(auth(), signedIn));

  assert.equal(await loadUploadAvailability(), null);

  assert.deepEqual(
    calls.filter(({ path }) => path === "/uploads/availability"),
    [{ method: "GET", path: "/uploads/availability", authorization: null }],
  );
  assert.equal(auth(), signedIn);
  assert.equal(readSessionToken(), STORED);
  resetUploadAvailability();
});

test("a wrong passphrase (401 authentication_failed) keeps the session", async () => {
  storeSessionToken(STORED);
  serve(({ path }) =>
    path === "/account/delete"
      ? envelope(401, "authentication_failed")
      : undefined,
  );
  renderProbe();
  await waitFor(() => assert.equal(auth(), signedIn));

  await act(async () => {
    await accountApi
      .deleteAccount(STORED, "not the passphrase")
      .catch(() => undefined);
  });
  assert.equal(auth(), signedIn);
  assert.equal(readSessionToken(), STORED);
});

// ---- pages while the session is checked -----------------------------------------
test("pages wait for the check instead of showing guest content", async () => {
  storeSessionToken(STORED);
  globalThis.fetch = () => new Promise<Response>(() => undefined);
  render(
    <AuthProvider>
      <SearchParamsContext.Provider value={new URLSearchParams("")}>
        <ProjectsScreen />
      </SearchParamsContext.Provider>
      <CartScreen />
    </AuthProvider>,
  );

  assert.ok(screen.getByText("Restoring your session…"));
  assert.ok(screen.getByText("Loading your demonstration cart…"));
  assert.equal(screen.queryByText(/Sign in to see/), null);
});

// ---- tabs -----------------------------------------------------------------------
test("each tab keeps its own session: another tab's storage events change nothing", async () => {
  storeSessionToken(STORED);
  serve();
  renderProbe();
  await waitFor(() => assert.equal(auth(), signedIn));

  window.dispatchEvent(
    new window.StorageEvent("storage", {
      key: "sewncovers.session-token",
      newValue: null,
      oldValue: STORED,
    }),
  );
  await act(async () => undefined);
  assert.equal(auth(), signedIn);
  assert.equal(readSessionToken(), STORED);
  assert.equal(window.localStorage.getItem("sewncovers.session-token"), null);
});
