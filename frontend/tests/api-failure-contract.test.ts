import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  AccountApiError,
  accountApi,
  readSessionToken,
  storeSessionToken,
} from "../services/account-api";
import { assuranceApi } from "../services/assurance-api";
import { commerceApi } from "../services/commerce-api";

// How each authenticated client reports every way a request can fail. The
// wording is each client's own and is pinned here; the error class, codes,
// status, request id, wait and session handling are the same for all three.

// Fixture values only; they are never printed.
const TOKEN = "T".repeat(43);
const REQUEST_ID = "0123456789abcdef0123456789abcdef";
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;

const clients = {
  account: {
    call: () => accountApi.listProjects(TOKEN),
    network: "The service could not be reached. Try again.",
    timeout: "The request timed out. Try again.",
    malformed: "The API response did not match its documented format.",
  },
  commerce: {
    call: () => commerceApi.cart(TOKEN),
    network: "The commerce service could not be reached. Try again.",
    timeout: "The commerce request timed out. Try again.",
    malformed: "The commerce API response was malformed.",
  },
  assurance: {
    call: () => assuranceApi.productionQueue(TOKEN),
    network: "The service could not be reached. Try again.",
    timeout: "The request timed out. Try again.",
    malformed: "The API response was malformed.",
  },
} as const;

const UNREADABLE = "The API returned an unreadable response.";
const GENERIC = "The request could not be completed.";

interface Expected {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
}

let fetchCalls = 0;

function respondWith(answer: () => Response | Promise<Response>): void {
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return answer();
  };
}

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

async function expectFailure(
  call: () => Promise<unknown>,
  expected: Expected,
): Promise<void> {
  await assert.rejects(call(), (error) => {
    assert.ok(error instanceof AccountApiError);
    assert.equal(error.status, expected.status);
    assert.equal(error.code, expected.code);
    assert.equal(error.message, expected.message);
    assert.equal(error.requestId, expected.requestId);
    assert.equal(error.retryAfterSeconds, expected.retryAfterSeconds);
    return true;
  });
}

beforeEach(() => {
  fetchCalls = 0;
  window.sessionStorage.clear();
  storeSessionToken(TOKEN);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  window.sessionStorage.clear();
});

for (const [name, client] of Object.entries(clients)) {
  test(`${name}: a failure to reach the service`, async () => {
    respondWith(() => {
      throw new TypeError("Failed to fetch");
    });
    await expectFailure(client.call, {
      status: 0,
      code: "network_error",
      message: client.network,
    });
    assert.equal(fetchCalls, 1, "authenticated requests are never retried");
    assert.equal(readSessionToken(), TOKEN);
  });

  test(`${name}: the 20 second time limit`, async () => {
    let limit: (() => void) | undefined;
    globalThis.setTimeout = ((callback: () => void, delay?: number) => {
      if (delay === 20_000) {
        limit = callback;
        return 0;
      }
      return originalSetTimeout(callback, delay);
    }) as typeof setTimeout;
    globalThis.fetch = (_url, init) => {
      fetchCalls += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
        queueMicrotask(() => limit?.());
      });
    };
    await expectFailure(client.call, {
      status: 0,
      code: "timeout",
      message: client.timeout,
    });
    assert.equal(fetchCalls, 1);
  });

  test(`${name}: a body that is not JSON`, async () => {
    respondWith(
      () => new Response("<html>Bad gateway</html>", { status: 502 }),
    );
    await expectFailure(client.call, {
      status: 502,
      code: "unreadable_response",
      message: UNREADABLE,
    });
    assert.equal(fetchCalls, 1);
  });

  test(`${name}: a success that does not match its format`, async () => {
    respondWith(() => Response.json({ unexpected: true }));
    await expectFailure(client.call, {
      status: 200,
      code: "malformed_response",
      message: client.malformed,
    });
  });

  test(`${name}: a documented error keeps the server's words, id and wait`, async () => {
    respondWith(() =>
      envelope(503, "service_busy", "The service is busy.", {
        "Retry-After": "30",
      }),
    );
    await expectFailure(client.call, {
      status: 503,
      code: "service_busy",
      message: "The service is busy.",
      requestId: REQUEST_ID,
      retryAfterSeconds: 30,
    });
    assert.equal(fetchCalls, 1, "authenticated requests are never retried");
  });

  test(`${name}: an error without a body`, async () => {
    respondWith(() => new Response(null, { status: 500 }));
    await expectFailure(client.call, {
      status: 500,
      code: "request_failed",
      message: GENERIC,
    });
  });

  test(`${name}: an ended session is cleared, a wrong passphrase is not`, async () => {
    respondWith(() =>
      envelope(401, "authentication_required", "Sign in again."),
    );
    await expectFailure(client.call, {
      status: 401,
      code: "authentication_required",
      message: "Sign in again.",
      requestId: REQUEST_ID,
    });
    assert.equal(readSessionToken(), null);

    storeSessionToken(TOKEN);
    respondWith(() =>
      envelope(401, "authentication_failed", "Credentials not accepted."),
    );
    await expectFailure(client.call, {
      status: 401,
      code: "authentication_failed",
      message: "Credentials not accepted.",
      requestId: REQUEST_ID,
    });
    assert.equal(readSessionToken(), TOKEN);
  });
}

test("assurance requests are never served from the browser cache", async () => {
  const caches: (RequestCache | undefined)[] = [];
  globalThis.fetch = async (_url, init) => {
    caches.push(init?.cache);
    return Response.json({ items: [], page: 1, pageSize: 20, total: 0 });
  };
  await assuranceApi.productionQueue(TOKEN);
  await accountApi.listProjects(TOKEN).catch(() => undefined);
  assert.deepEqual(caches, ["no-store", undefined]);
});
