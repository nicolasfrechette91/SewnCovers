import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { importFresh } from "../tests/fresh-import.mjs";

const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

// A fresh copy, as a build with this public variable would embed it. No
// argument means a configured URL; an explicit undefined means none.
async function loadHttp(...args) {
  const apiUrl = args.length === 0 ? "https://api.example.com/v1///" : args[0];
  if (apiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = apiUrl;
  return importFresh("./http.ts", import.meta.url);
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...headers },
    status,
  });
}

// Records each request and answers with the given response factory.
function respond(answer = () => jsonResponse({})) {
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ init, url: String(url) });
    return answer(url, init);
  };
  return requests;
}

// Timers that only run when told to, so a 20 s limit takes no time.
let timers;
beforeEach(() => {
  timers = new Map();
  let next = 1;
  globalThis.setTimeout = (callback, delay = 0) => {
    const id = next++;
    timers.set(id, { callback, delay });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
});

function fireTimer(delay) {
  const entry = [...timers].find(([, timer]) => timer.delay === delay);
  assert.ok(entry, `no ${delay} ms timer is pending`);
  timers.delete(entry[0]);
  entry[1].callback();
}

// Never settles until the request's signal aborts, like a silent server.
function hangUntilAborted(_url, init) {
  return new Promise((_resolve, reject) => {
    init.signal.addEventListener(
      "abort",
      () => reject(new DOMException("private abort detail", "AbortError")),
      { once: true },
    );
  });
}

test("joins the API URL and path, and appends only defined query values", async () => {
  const { send } = await loadHttp();
  const requests = respond();

  await send({ path: "//projects/a%2Fb" });
  await send({
    path: "admin/production-work",
    query: { page: "1", search: "warm botanical", state: undefined },
  });

  assert.deepEqual(
    requests.map((request) => request.url),
    [
      "https://api.example.com/v1/projects/a%2Fb",
      "https://api.example.com/v1/admin/production-work?page=1&search=warm+botanical",
    ],
  );
});

test("without a configured API URL nothing is sent and no timer is left", async () => {
  const { send, TransportError } = await loadHttp(undefined);
  const requests = respond();

  await assert.rejects(
    send({ path: "/account" }),
    (error) =>
      error instanceof TransportError && error.kind === "configuration",
  );
  assert.equal(requests.length, 0);
  assert.equal(timers.size, 0);
});

test("sends JSON and the bearer token only when given, and a cache mode only when asked", async () => {
  const { send } = await loadHttp();
  const requests = respond();

  await send({ path: "/patterns" });
  await send({ path: "/account", token: "T".repeat(43) });
  await send({
    path: "/projects",
    method: "POST",
    body: { name: "Patio" },
    token: "T".repeat(43),
    cache: "no-store",
  });

  const [plain, authorized, posted] = requests.map(({ init }) => init);
  assert.equal(plain.method, "GET");
  assert.deepEqual(plain.headers, {});
  assert.equal(plain.body, undefined);
  assert.equal("cache" in plain, false);
  assert.deepEqual(authorized.headers, {
    Authorization: `Bearer ${"T".repeat(43)}`,
  });
  assert.equal(posted.method, "POST");
  assert.deepEqual(posted.headers, {
    "Content-Type": "application/json",
    Authorization: `Bearer ${"T".repeat(43)}`,
  });
  assert.equal(posted.body, JSON.stringify({ name: "Patio" }));
  assert.equal(posted.cache, "no-store");
});

test("reads JSON, empty and unreadable bodies and keeps the status and headers", async () => {
  const { send } = await loadHttp();
  const bodies = [
    jsonResponse({ ok: true }, 201, { "X-Request-ID": "abc" }),
    new Response(null, { status: 204 }),
    new Response("<html>Bad gateway</html>", { status: 502 }),
  ];
  respond(() => bodies.shift());

  const json = await send({ path: "/a" });
  const empty = await send({ path: "/b" });
  const html = await send({ path: "/c" });

  assert.deepEqual(json.body, { ok: true });
  assert.equal(json.status, 201);
  assert.equal(json.ok, true);
  assert.equal(json.unreadable, false);
  assert.equal(json.headers.get("X-Request-ID"), "abc");
  assert.equal(empty.body, undefined);
  assert.equal(empty.unreadable, false);
  assert.equal(html.body, undefined);
  assert.equal(html.unreadable, true);
  assert.equal(html.ok, false);
  assert.equal(html.status, 502);
});

test("the time limit aborts the request, reports a timeout and clears its timer", async () => {
  const { send, TransportError, REQUEST_TIMEOUT_MS } = await loadHttp();
  let signal;
  respond((url, init) => {
    signal = init.signal;
    return hangUntilAborted(url, init);
  });

  const request = send({ path: "/account" });
  await Promise.resolve();
  fireTimer(REQUEST_TIMEOUT_MS);

  await assert.rejects(
    request,
    (error) =>
      error instanceof TransportError &&
      error.kind === "timeout" &&
      !/private abort detail/.test(error.message),
  );
  assert.equal(REQUEST_TIMEOUT_MS, 20_000);
  assert.equal(signal.aborted, true);
  assert.equal(timers.size, 0);
});

test("a failure to reach the service is a network failure without its details", async () => {
  const { send, TransportError } = await loadHttp();
  respond(() => {
    throw new TypeError("private network address");
  });

  await assert.rejects(
    send({ path: "/account" }),
    (error) =>
      error instanceof TransportError &&
      error.kind === "network" &&
      !/private network address/.test(error.message),
  );
  assert.equal(timers.size, 0);
});

test("a caller's cancellation aborts the request and is never a timeout or network failure", async () => {
  const { send, TransportError } = await loadHttp();
  let signal;
  const requests = respond((url, init) => {
    signal = init.signal;
    return hangUntilAborted(url, init);
  });

  const during = new AbortController();
  const request = send({ path: "/projects", signal: during.signal });
  await Promise.resolve();
  during.abort();
  await assert.rejects(
    request,
    (error) => error instanceof TransportError && error.kind === "aborted",
  );
  assert.equal(signal.aborted, true);

  const before = new AbortController();
  before.abort();
  await assert.rejects(
    send({ path: "/projects", signal: before.signal }),
    (error) => error instanceof TransportError && error.kind === "aborted",
  );
  assert.equal(requests.length, 1);
  assert.equal(timers.size, 0);
});

test("the request's own controller is released after a success", async () => {
  const { send } = await loadHttp();
  let signal;
  respond((_url, init) => {
    signal = init.signal;
    return jsonResponse([]);
  });

  await send({ path: "/patterns" });

  assert.equal(signal.aborted, true);
  assert.equal(timers.size, 0);
});

test("reads a delay-seconds Retry-After and ignores dates and junk", async () => {
  const { retryAfterSeconds } = await loadHttp();
  const header = (value) => new Headers({ "Retry-After": value });

  assert.equal(retryAfterSeconds(header("120")), 120);
  assert.equal(retryAfterSeconds(header(" 2 ")), 2);
  for (const value of ["0", "-5", "soon", "Wed, 21 Oct 2026 07:28:00 GMT"]) {
    assert.equal(retryAfterSeconds(header(value)), undefined);
  }
  assert.equal(retryAfterSeconds(new Headers()), undefined);
});
