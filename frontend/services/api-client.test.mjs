import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, afterEach, beforeEach, test } from "node:test";

import ts from "typescript";

const environmentSource = readFileSync(
  new URL("../config/environment.ts", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("./api-client.ts", import.meta.url),
  "utf8",
);
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
let moduleSequence = 0;

function transpile(source) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });

  assert.deepEqual(result.diagnostics, []);
  return result.outputText;
}

async function loadClient(apiUrl) {
  const configuredApiUrl =
    arguments.length === 0
      ? "https://api.example.com/v1///"
      : apiUrl;

  if (configuredApiUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = configuredApiUrl;
  }

  moduleSequence += 1;
  const environmentUrl = `data:text/javascript;base64,${Buffer.from(
    transpile(environmentSource),
  ).toString("base64")}#environment-${moduleSequence}`;
  const compiledClient = transpile(clientSource).replace(
    '"../config/environment"',
    JSON.stringify(environmentUrl),
  );
  const clientUrl = `data:text/javascript;base64,${Buffer.from(
    compiledClient,
  ).toString("base64")}#client-${moduleSequence}`;

  return import(clientUrl);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function pattern(overrides = {}) {
  return {
    id: "fern-trail",
    name: "Fern trail",
    description: "Layered fronds.",
    categoryId: "botanical",
    colorIds: ["ivory", "green"],
    previewClassName: "pattern-fern-trail",
    ...overrides,
  };
}

function design(overrides = {}) {
  return {
    shape: "rectangle",
    width: 45.25,
    height: 55.5,
    thickness: 8.75,
    unit: "cm",
    patternId: "fern-trail",
    patternScale: 1.2,
    publicId: "AbCdEfGhIjKlMnOpQrSt_1",
    ...overrides,
  };
}

function createDesignRequest(value = design()) {
  const request = { ...value };
  delete request.publicId;
  return request;
}

function backendError(
  status = 503,
  code = "storage_unavailable",
  location = ["service", "storage"],
) {
  return jsonResponse(
    {
      errors: [
        {
          code,
          message:
            code === "storage_unavailable"
              ? "Storage is temporarily unavailable."
              : "Selected pattern is unavailable.",
          location,
        },
      ],
    },
    status,
  );
}

class FakeClock {
  #nextId = 1;
  #now = 0;
  #tasks = new Map();

  clearTimeout = (id) => {
    this.#tasks.delete(id);
  };

  setTimeout = (callback, delay = 0, ...args) => {
    const id = this.#nextId;
    this.#nextId += 1;
    this.#tasks.set(id, {
      callback: () => callback(...args),
      due: this.#now + Number(delay),
    });
    return id;
  };

  get pendingCount() {
    return this.#tasks.size;
  }

  async tick(milliseconds) {
    const target = this.#now + milliseconds;

    while (true) {
      const next = Array.from(this.#tasks.entries())
        .filter(([, task]) => task.due <= target)
        .sort((left, right) => left[1].due - right[1].due)[0];

      if (!next) {
        break;
      }

      const [id, task] = next;
      this.#tasks.delete(id);
      this.#now = task.due;
      task.callback();
      await settle();
    }

    this.#now = target;
    await settle();
  }
}

async function settle() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

let clock;

beforeEach(() => {
  clock = new FakeClock();
  globalThis.setTimeout = clock.setTimeout;
  globalThis.clearTimeout = clock.clearTimeout;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});

after(() => {
  if (originalApiUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  }
});

test("fails clearly without NEXT_PUBLIC_API_URL before calling fetch", async () => {
  const { apiClient, ApiClientError } = await loadClient(undefined);
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return jsonResponse({ process: "healthy", database: "healthy" });
  };

  await assert.rejects(
    apiClient.getHealth(),
    (error) =>
      error instanceof ApiClientError &&
      error.category === "configuration" &&
      /NEXT_PUBLIC_API_URL/.test(error.message) &&
      !/https?:/.test(error.message),
  );
  assert.equal(fetchCalls, 0);
  assert.equal(clock.pendingCount, 0);
});

test("rejects an invalid configured URL without echoing its value", async () => {
  const privateValue =
    "postgresql://private-user:private-pass@private-host/secret-db";

  await assert.rejects(
    loadClient(privateValue),
    (error) =>
      /NEXT_PUBLIC_API_URL/.test(error.message) &&
      !/private-user|private-pass|private-host|secret-db/.test(error.message),
  );
});

test("normalizes base paths, joins endpoints, and encodes filters and IDs", async () => {
  const { apiClient } = await loadClient();
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ init, url: String(url) });

    if (String(url).includes("/patterns")) {
      return jsonResponse([]);
    }
    return jsonResponse(design());
  };

  await apiClient.listPatterns({
    category: "warm botanical",
    color: "green/ivory",
  });
  await apiClient.getDesign("AbCdEfGhIjKlMnOpQrSt_1");

  assert.equal(
    requests[0].url,
    "https://api.example.com/v1/patterns?category=warm+botanical&color=green%2Fivory",
  );
  assert.equal(
    requests[1].url,
    "https://api.example.com/v1/designs/AbCdEfGhIjKlMnOpQrSt_1",
  );
  assert.equal(requests[0].init.method, "GET");
  assert.equal(requests[1].init.method, "GET");
  assert.equal(clock.pendingCount, 0);
});

test("returns exact typed health, pattern, create, and retrieval responses", async () => {
  const { apiClient } = await loadClient();
  const createdDesign = design();
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ init, url: String(url) });

    if (String(url).endsWith("/health")) {
      return jsonResponse(
        { process: "healthy", database: "unconfigured" },
        503,
      );
    }
    if (String(url).endsWith("/patterns")) {
      return jsonResponse([pattern()]);
    }
    return jsonResponse(
      createdDesign,
      init.method === "POST" ? 201 : 200,
    );
  };

  assert.deepEqual(await apiClient.getHealth(), {
    process: "healthy",
    database: "unconfigured",
  });
  assert.deepEqual(await apiClient.listPatterns(), [pattern()]);
  assert.deepEqual(
    await apiClient.createDesign(createDesignRequest(createdDesign)),
    createdDesign,
  );
  assert.deepEqual(
    await apiClient.getDesign(createdDesign.publicId),
    createdDesign,
  );
  assert.equal(requests.length, 4);
  assert.equal(requests[2].init.method, "POST");
  assert.deepEqual(requests[2].init.headers, {
    "Content-Type": "application/json",
  });
  assert.deepEqual(JSON.parse(requests[2].init.body), {
    shape: "rectangle",
    width: 45.25,
    height: 55.5,
    thickness: 8.75,
    unit: "cm",
    patternId: "fern-trail",
    patternScale: 1.2,
  });
});

test("preserves the exact typed backend error contract without retrying validation", async () => {
  const { apiClient, ApiClientError } = await loadClient();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return backendError(
      422,
      "pattern_unavailable",
      ["body", "patternId"],
    );
  };

  await assert.rejects(
    apiClient.createDesign(createDesignRequest()),
    (error) => {
      assert.equal(error instanceof ApiClientError, true);
      assert.equal(error.category, "backend-contract");
      assert.equal(error.status, 422);
      assert.deepEqual(error.errors, [
        {
          code: "pattern_unavailable",
          message: "Selected pattern is unavailable.",
          location: ["body", "patternId"],
        },
      ]);
      return true;
    },
  );
  assert.equal(fetchCalls, 1);
});

test("distinguishes malformed success payloads from unexpected HTTP failures", async () => {
  const { apiClient, ApiClientError } = await loadClient();
  globalThis.fetch = async () =>
    jsonResponse({
      process: "healthy",
      database: "healthy",
      databaseHost: "private-host",
    });

  await assert.rejects(
    apiClient.getHealth(),
    (error) =>
      error instanceof ApiClientError &&
      error.category === "malformed-response" &&
      !/private-host/.test(error.message),
  );

  globalThis.fetch = async () =>
    jsonResponse(design({ patternScale: 1e-7 }));

  await assert.rejects(
    apiClient.getDesign("AbCdEfGhIjKlMnOpQrSt_1"),
    (error) =>
      error instanceof ApiClientError &&
      error.category === "malformed-response",
  );

  globalThis.fetch = async () =>
    new Response("private stack trace", { status: 418 });

  await assert.rejects(
    apiClient.listPatterns(),
    (error) =>
      error instanceof ApiClientError &&
      error.category === "http" &&
      error.status === 418 &&
      !/private stack trace/.test(error.message),
  );
});

test("rejects a malformed design-creation success without retrying or trusting its public ID", async () => {
  const { apiClient, ApiClientError } = await loadClient();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return jsonResponse(
      design({
        publicId: "malformed/public/id",
      }),
      201,
    );
  };

  await assert.rejects(
    apiClient.createDesign(createDesignRequest()),
    (error) =>
      error instanceof ApiClientError &&
      error.category === "malformed-response",
  );
  assert.equal(fetchCalls, 1);
});

test("aborts a timed-out request and clears its controller and timers", async () => {
  const { apiClient, ApiClientError, API_REQUEST_TIMEOUT_MS } =
    await loadClient();
  let requestSignal;
  globalThis.fetch = async (_url, init) => {
    requestSignal = init.signal;
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener(
        "abort",
        () => reject(new DOMException("private timeout detail", "AbortError")),
        { once: true },
      );
    });
  };

  const request = apiClient.createDesign(
    createDesignRequest(),
  );
  await clock.tick(API_REQUEST_TIMEOUT_MS);

  await assert.rejects(
    request,
    (error) =>
      error instanceof ApiClientError &&
      error.category === "timeout" &&
      !/private timeout detail/.test(error.message),
  );
  assert.equal(requestSignal.aborted, true);
  assert.equal(clock.pendingCount, 0);
});

test("retries only safe transient GET failures and stops at the exact limit", async () => {
  const { apiClient, ApiClientError, API_RETRY_LIMIT } =
    await loadClient();
  let fetchCalls = 0;
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    activeRequests += 1;
    maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
    activeRequests -= 1;
    throw new TypeError("private network address");
  };

  const request = apiClient.listPatterns();
  await settle();

  for (let retry = 1; retry <= API_RETRY_LIMIT; retry += 1) {
    await clock.tick(retry === 1 ? 500 : 1_000);
  }

  await assert.rejects(
    request,
    (error) =>
      error instanceof ApiClientError &&
      error.category === "network" &&
      !/private network address/.test(error.message),
  );
  assert.equal(fetchCalls, API_RETRY_LIMIT + 1);
  assert.equal(maximumActiveRequests, 1);
  assert.equal(clock.pendingCount, 0);
});

test("retries transient backend and HTTP statuses but not permanent GET failures", async () => {
  const { apiClient } = await loadClient();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1 ? backendError(503) : jsonResponse([pattern()]);
  };

  const backendRetry = apiClient.listPatterns();
  await settle();
  await clock.tick(500);
  assert.deepEqual(await backendRetry, [pattern()]);
  assert.equal(calls, 2);

  calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response("", { status: 502 })
      : jsonResponse([pattern()]);
  };

  const httpRetry = apiClient.listPatterns();
  await settle();
  await clock.tick(500);
  assert.deepEqual(await httpRetry, [pattern()]);
  assert.equal(calls, 2);

  calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return backendError(
      404,
      "design_not_found",
      ["path", "public_id"],
    );
  };

  await assert.rejects(apiClient.getDesign("AbCdEfGhIjKlMnOpQrSt_1"));
  assert.equal(calls, 1);
});

test("never retries unsafe design creation even after a transient failure", async () => {
  const { apiClient, ApiClientError } = await loadClient();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new TypeError("private submitted design detail");
  };

  await assert.rejects(
    apiClient.createDesign(createDesignRequest()),
    (error) =>
      error instanceof ApiClientError &&
      error.category === "network" &&
      !/private submitted design detail/.test(error.message),
  );
  assert.equal(fetchCalls, 1);
  assert.equal(clock.pendingCount, 0);
});

test("reports delayed cold start followed by recovery and cleans up status timers", async () => {
  const { apiClient, API_COLD_START_DELAY_MS } = await loadClient();
  const statuses = [];
  let resolveFetch;
  globalThis.fetch = async () =>
    new Promise((resolve) => {
      resolveFetch = resolve;
    });

  const request = apiClient.listPatterns(
    {},
    { onStatus: (status) => statuses.push(status) },
  );
  await clock.tick(API_COLD_START_DELAY_MS);
  assert.deepEqual(
    statuses.map(({ state }) => state),
    ["connecting", "cold-start"],
  );
  assert.match(statuses[1].message, /may be waking up/i);

  resolveFetch(jsonResponse([pattern()]));
  assert.deepEqual(await request, [pattern()]);
  assert.deepEqual(
    statuses.map(({ state }) => state),
    ["connecting", "cold-start", "success"],
  );
  assert.equal(statuses.at(-1).message, "SewnCovers is connected.");
  assert.equal(clock.pendingCount, 0);
});

test("reports bounded retry recovery and a useful secret-safe final failure", async () => {
  const { apiClient } = await loadClient();
  const recoveryStatuses = [];
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      throw new TypeError("private first failure");
    }
    return jsonResponse([pattern()]);
  };

  const recovery = apiClient.listPatterns(
    {},
    { onStatus: (status) => recoveryStatuses.push(status) },
  );
  await settle();
  await clock.tick(500);
  await recovery;
  assert.deepEqual(
    recoveryStatuses.map(({ state }) => state),
    ["connecting", "retrying", "success"],
  );
  assert.deepEqual(recoveryStatuses[1], {
    message:
      "The SewnCovers API may be waking up. Retrying (1 of 2)\u2026",
    retry: 1,
    retryLimit: 2,
    state: "retrying",
  });

  const failureStatuses = [];
  globalThis.fetch = async () =>
    new Response("private framework trace", { status: 400 });

  await assert.rejects(
    apiClient.listPatterns(
      {},
      { onStatus: (status) => failureStatuses.push(status) },
    ),
  );
  assert.deepEqual(
    failureStatuses.map(({ state }) => state),
    ["connecting", "failure"],
  );
  assert.equal(failureStatuses.at(-1).category, "http");
  assert.match(failureStatuses.at(-1).message, /unexpected HTTP response/i);
  assert.doesNotMatch(
    JSON.stringify(failureStatuses),
    /private framework trace/,
  );
  assert.equal(clock.pendingCount, 0);
});

test("cleans up the timeout controller after an immediate success", async () => {
  const { apiClient } = await loadClient();
  let signal;
  globalThis.fetch = async (_url, init) => {
    signal = init.signal;
    return jsonResponse([pattern()]);
  };

  assert.deepEqual(await apiClient.listPatterns(), [pattern()]);
  assert.equal(signal.aborted, true);
  assert.equal(clock.pendingCount, 0);
});
