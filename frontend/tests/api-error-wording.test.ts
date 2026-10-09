import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  AccountApiError,
  accountApi,
  performUpload,
  readSessionToken,
  storeSessionToken,
  waitPhrase,
} from "../services/account-api";
import { assuranceApi } from "../services/assurance-api";
import { signInErrorMessage } from "../services/auth-errors";

// Fixture values only; they are never printed.
const TOKEN = "T".repeat(43);
const REQUEST_ID = "0123456789abcdef0123456789abcdef";
const originalFetch = globalThis.fetch;

function envelope(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({
      errors: [{ code, message, location: ["request"] }],
      requestId: REQUEST_ID,
    }),
    { headers: { "Content-Type": "application/json", ...headers }, status },
  );
}

function respondWith(response: () => Response): void {
  globalThis.fetch = async () => response();
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  window.sessionStorage.clear();
});

test("a wrong passphrase on account deletion keeps the user signed in", async () => {
  storeSessionToken(TOKEN);
  respondWith(() =>
    envelope(
      401,
      "authentication_failed",
      "Email or password could not be accepted.",
    ),
  );

  await assert.rejects(
    accountApi.deleteAccount(TOKEN, "not the passphrase"),
    (error) =>
      error instanceof AccountApiError &&
      error.status === 401 &&
      error.code === "authentication_failed",
  );
  assert.equal(readSessionToken(), TOKEN);
});

test("an expired or revoked session still ends the stored session", async () => {
  storeSessionToken(TOKEN);
  respondWith(() =>
    envelope(
      401,
      "authentication_required",
      "Authentication is required or the session is no longer valid.",
    ),
  );

  await assert.rejects(accountApi.current(TOKEN));
  assert.equal(readSessionToken(), null);
});

test("limited and busy responses carry the wait and the request id", async () => {
  respondWith(() =>
    envelope(
      429,
      "credential_throttled",
      "Too many incorrect passphrase attempts. Try again in 2 minutes.",
      { "Retry-After": "120" },
    ),
  );

  await assert.rejects(
    accountApi.login("a@example.invalid", "x".repeat(12)),
    (error) => {
      assert.ok(error instanceof AccountApiError);
      assert.equal(error.status, 429);
      assert.equal(error.code, "credential_throttled");
      assert.equal(error.retryAfterSeconds, 120);
      assert.equal(error.requestId, REQUEST_ID);
      return true;
    },
  );

  for (const header of ["soon", "Wed, 21 Oct 2026 07:28:00 GMT", "0", "-5"]) {
    respondWith(() =>
      envelope(503, "service_busy", "The service is busy.", {
        "Retry-After": header,
      }),
    );
    await assert.rejects(
      accountApi.login("a@example.invalid", "x".repeat(12)),
      (error) =>
        error instanceof AccountApiError &&
        error.retryAfterSeconds === undefined,
    );
  }
});

test("sign-in wording uses the server's wait and never calls a busy server asleep", () => {
  const limited = new AccountApiError("x", 429, "credential_throttled", {
    retryAfterSeconds: 90,
  });
  const busy = new AccountApiError("x", 503, "service_busy", {
    retryAfterSeconds: 2,
  });
  const sleeping = new AccountApiError("x", 503, "storage_unavailable");

  for (const mode of ["login", "register"] as const) {
    assert.equal(
      signInErrorMessage(limited, mode),
      "Too many attempts. Try again in 2 minutes.",
    );
    assert.equal(
      signInErrorMessage(busy, mode),
      "The SewnCovers service is busy right now. Wait a few seconds and try again.",
    );
    assert.match(signInErrorMessage(sleeping, mode), /may be waking up/);
  }
  assert.match(
    signInErrorMessage(
      new AccountApiError("x", 429, "credential_throttled"),
      "login",
    ),
    /Wait a few minutes before trying again/,
  );
});

test("waits are described the way the API describes them", () => {
  assert.deepEqual([1, 5, 6, 59, 60, 61, 3_599, 3_600, 7_200].map(waitPhrase), [
    "a few seconds",
    "a few seconds",
    "6 seconds",
    "59 seconds",
    "1 minute",
    "2 minutes",
    "1 hour",
    "1 hour",
    "2 hours",
  ]);
});

test("an upload over the size limit says so instead of a generic transfer error", async () => {
  respondWith(() =>
    envelope(
      413,
      "payload_too_large",
      "The request is larger than this endpoint accepts.",
    ),
  );
  const operation = {
    method: "PUT" as const,
    url: "/uploads/direct/" + "U".repeat(43),
    headers: { "Content-Type": "image/png" },
    fields: {},
    expiresAt: "2099-01-01T00:00:00Z",
  };

  await assert.rejects(
    performUpload(operation, new File([new Uint8Array(8)], "pattern.png")),
    (error) =>
      error instanceof AccountApiError &&
      error.status === 413 &&
      error.code === "payload_too_large" &&
      error.message ===
        "This image is larger than the 10 MB upload limit. Choose a smaller file.",
  );
});

test("administrator routes report a permission failure with its stable code", async () => {
  respondWith(() =>
    envelope(
      403,
      "permission_denied",
      "This action requires an administrator account.",
    ),
  );

  await assert.rejects(
    assuranceApi.productionQueue(TOKEN),
    (error) =>
      error instanceof AccountApiError &&
      error.status === 403 &&
      error.code === "permission_denied" &&
      error.message === "This action requires an administrator account.",
  );
});
