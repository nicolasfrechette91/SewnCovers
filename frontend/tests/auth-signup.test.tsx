import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { AuthForm } from "../components/account/auth-form";
import { InlineSignIn } from "../components/account/inline-sign-in";
import { publicEnvironment } from "../config/environment";
import { AuthProvider } from "../context/auth";
import {
  ACKNOWLEDGEMENT_FAILED_CODE,
  AccountApiError,
} from "../services/account-api";
import { signInErrorMessage } from "../services/auth-errors";

// Fixture values only; they are never printed.
const TEST_PASSPHRASE = "correct horse battery staple";
const TEST_TOKEN = "T".repeat(43);
const API = publicEnvironment.apiUrl;

interface RecordedCall {
  readonly authorized: boolean;
  readonly bodyKeys: readonly string[];
  readonly method: string;
  readonly url: string;
}

const originalFetch = globalThis.fetch;
let calls: RecordedCall[] = [];
let respond: (call: RecordedCall) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function apiError(code: string, message: string, status: number): Response {
  return json({ errors: [{ code, message, location: ["path"] }] }, status);
}

const ACCOUNT = {
  createdAt: "2026-10-01T00:00:00Z",
  email: "new@example.invalid",
  role: "customer",
};

const created = (path: string): Response =>
  path === "/account"
    ? json(ACCOUNT)
    : path === "/account/sessions"
      ? json([
          {
            createdAt: "2026-10-01T00:00:00Z",
            current: true,
            expiresAt: "2099-01-01T00:00:00Z",
            id: 1,
            revokedAt: null,
          },
        ])
      : path === "/auth/register" || path === "/auth/login"
        ? json(
            {
              account: ACCOUNT,
              expiresAt: "2099-01-01T00:00:00Z",
              token: TEST_TOKEN,
            },
            path === "/auth/register" ? 201 : 200,
          )
        : json(
            {
              acknowledgedAt: "2026-10-01T00:00:01Z",
              documentType: "terms",
              documentVersion: 1,
              id: 1,
              purpose: "account_terms",
            },
            201,
          );

beforeEach(() => {
  calls = [];
  respond = (call) => created(new URL(call.url).pathname);
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ) => {
    const call: RecordedCall = {
      authorized: new Headers(init?.headers).has("authorization"),
      bodyKeys:
        typeof init?.body === "string"
          ? Object.keys(JSON.parse(init.body) as object).sort()
          : [],
      method: init?.method ?? "GET",
      url: String(input),
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.sessionStorage.clear();
});

function fillAndSubmit(container: HTMLElement, options: { terms: boolean }) {
  const email = container.querySelector<HTMLInputElement>(
    'input[name="email"]',
  )!;
  const password = container.querySelector<HTMLInputElement>(
    'input[name="password"]',
  )!;
  email.value = "new@example.invalid";
  password.value = TEST_PASSPHRASE;
  const terms = container.querySelector<HTMLInputElement>(
    'input[name="acceptedTerms"]',
  );
  if (terms && options.terms) fireEvent.click(terms);
  fireEvent.submit(container.querySelector("form")!);
}

const signUpCalls = () =>
  calls.map(({ authorized, bodyKeys, method, url }) => ({
    authorized,
    bodyKeys,
    method,
    path: url,
  }));

// After the session is stored the provider re-verifies it with two GETs.
const SESSION_CHECKS = [
  { authorized: true, bodyKeys: [], method: "GET", path: `${API}/account` },
  {
    authorized: true,
    bodyKeys: [],
    method: "GET",
    path: `${API}/account/sessions`,
  },
];

const EXPECTED_SIGN_UP = [
  {
    authorized: false,
    bodyKeys: ["email", "password"],
    method: "POST",
    path: `${API}/auth/register`,
  },
  {
    authorized: true,
    bodyKeys: ["documentType", "documentVersion", "purpose"],
    method: "POST",
    path: `${API}/account/acknowledgements`,
  },
  ...SESSION_CHECKS,
];

test("the /account create-account form POSTs /auth/register, then records the terms", async () => {
  let signedIn = 0;
  const { container } = render(
    <AuthProvider>
      <AuthForm
        focusHeading={false}
        mode="register"
        onSuccess={() => (signedIn += 1)}
      />
    </AuthProvider>,
  );

  fillAndSubmit(container, { terms: true });
  await waitFor(() => assert.equal(signedIn, 1));

  assert.deepEqual(signUpCalls(), EXPECTED_SIGN_UP);
});

test("the inline create-account step sends the identical requests and calls back once", async () => {
  let signedIn = 0;
  const { container } = render(
    <AuthProvider>
      <InlineSignIn
        idPrefix="upload"
        titles={{
          login: "Sign in",
          register: "Create an account to upload your own pattern",
        }}
        reason={<p>Reason.</p>}
        onCancel={() => undefined}
        onSignedIn={() => (signedIn += 1)}
      />
    </AuthProvider>,
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Create an account instead" }),
  );
  fillAndSubmit(container, { terms: true });
  await waitFor(() => assert.equal(signedIn, 1));
  await act(async () => undefined);

  assert.deepEqual(signUpCalls(), EXPECTED_SIGN_UP);
  assert.equal(signedIn, 1);
  assert.ok(
    calls.every(
      ({ url }) => url.startsWith(`${API}/`) && !url.includes("github.io"),
    ),
  );
});

test("sign-in uses POST /auth/login and does not record terms", async () => {
  let signedIn = 0;
  const { container } = render(
    <AuthProvider>
      <AuthForm
        focusHeading={false}
        mode="login"
        onSuccess={() => (signedIn += 1)}
      />
    </AuthProvider>,
  );

  fillAndSubmit(container, { terms: false });
  await waitFor(() => assert.equal(signedIn, 1));

  assert.deepEqual(signUpCalls(), [
    {
      authorized: false,
      bodyKeys: ["email", "password"],
      method: "POST",
      path: `${API}/auth/login`,
    },
    ...SESSION_CHECKS,
  ]);
});

const FAILURES = [
  {
    expected: /Accounts aren't available on the SewnCovers service right now/,
    name: "404 (route missing on the deployed API)",
    response: () => apiError("resource_not_found", "Resource not found.", 404),
  },
  {
    expected:
      /couldn't create an account with those details\. If you already have one, sign in instead/,
    name: "401 (the API's answer for an existing email)",
    response: () =>
      apiError(
        "authentication_failed",
        "Email or password could not be accepted.",
        401,
      ),
  },
  {
    expected: /email address is already in use/,
    name: "409",
    response: () => apiError("resource_conflict", "Conflict.", 409),
  },
  {
    expected: /Check your email address and passphrase/,
    name: "422",
    response: () => apiError("invalid_value", "Invalid.", 422),
  },
  {
    expected: /Too many attempts/,
    name: "429",
    response: () => apiError("credential_throttled", "Too many.", 429),
  },
  {
    expected: /may be waking up or temporarily unavailable/,
    name: "503",
    response: () => apiError("storage_unavailable", "Storage.", 503),
  },
  {
    expected: /Something unexpected went wrong/,
    name: "500",
    response: () => apiError("internal_error", "Internal.", 500),
  },
] as const;

for (const failure of FAILURES) {
  test(`create account: ${failure.name} shows a clear, announced, focused message`, async () => {
    respond = () => failure.response();
    const { container } = render(
      <AuthProvider>
        <AuthForm
          focusHeading={false}
          mode="register"
          onSuccess={() => undefined}
        />
      </AuthProvider>,
    );

    fillAndSubmit(container, { terms: true });
    const alert = await screen.findByRole("alert");

    assert.match(alert.textContent ?? "", failure.expected);
    assert.doesNotMatch(
      alert.textContent ?? "",
      /Resource not found|Conflict\.|Internal\./,
    );
    assert.equal(alert.getAttribute("aria-live"), "assertive");
    assert.ok(
      document.activeElement?.contains(alert),
      "focus moves to the error",
    );
    assert.equal(
      window.sessionStorage.length,
      0,
      "no session is stored on failure",
    );
  });
}

test("a network failure reads as unavailable, not as a raw error", async () => {
  respond = () => {
    throw new TypeError("Failed to fetch");
  };
  const { container } = render(
    <AuthProvider>
      <AuthForm focusHeading={false} mode="login" onSuccess={() => undefined} />
    </AuthProvider>,
  );

  fillAndSubmit(container, { terms: false });
  const alert = await screen.findByRole("alert");

  assert.match(
    alert.textContent ?? "",
    /may be waking up or temporarily unavailable/,
  );
  assert.doesNotMatch(alert.textContent ?? "", /Failed to fetch/);
});

test("a rejected terms acknowledgement says the account exists and stores no session", async () => {
  respond = (call) =>
    new URL(call.url).pathname === "/account/acknowledgements"
      ? apiError("resource_not_found", "Resource not found.", 404)
      : created(new URL(call.url).pathname);
  const { container } = render(
    <AuthProvider>
      <AuthForm
        focusHeading={false}
        mode="register"
        onSuccess={() => undefined}
      />
    </AuthProvider>,
  );

  fillAndSubmit(container, { terms: true });
  const alert = await screen.findByRole("alert");

  assert.match(
    alert.textContent ?? "",
    /account was created, but the terms acknowledgement could not be saved/,
  );
  assert.equal(window.sessionStorage.length, 0);
});

test("sign-in wording is mode-aware and never confirms that an email is registered", () => {
  const failed = new AccountApiError("x", 401, "authentication_failed");

  assert.match(signInErrorMessage(failed, "login"), /don't match an account/);
  assert.doesNotMatch(
    signInErrorMessage(failed, "register"),
    /already (in use|registered|exists)/i,
  );
  assert.match(
    signInErrorMessage(
      new AccountApiError("x", 0, ACKNOWLEDGEMENT_FAILED_CODE),
      "register",
    ),
    /Sign in with the same email/,
  );
  assert.match(
    signInErrorMessage(new AccountApiError("x", 0, "timeout"), "login"),
    /waking up/,
  );
  assert.match(signInErrorMessage(new Error("raw"), "login"), /unexpected/);
});
