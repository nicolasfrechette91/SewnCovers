import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";

import ts from "typescript";

const environmentSource = readFileSync(
  new URL("../config/environment.ts", import.meta.url),
  "utf8",
);
const accountApiSource = readFileSync(
  new URL("./account-api.ts", import.meta.url),
  "utf8",
);
const PRODUCTION_API_URL = "https://sewncovers-api.onrender.com";
const PAGES_HOST = "nicolasfrechette91.github.io";
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
const originalBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
const originalFetch = globalThis.fetch;
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

const toDataUrl = (code, label) =>
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}#${label}-${moduleSequence}`;

// Loads a fresh copy, as a build with these public variables would embed them.
async function loadAccountApi({ apiUrl, basePath }) {
  process.env.NEXT_PUBLIC_API_URL = apiUrl;
  process.env.NEXT_PUBLIC_BASE_PATH = basePath;
  moduleSequence += 1;
  const environmentUrl = toDataUrl(transpile(environmentSource), "environment");

  return import(
    toDataUrl(
      transpile(accountApiSource).replace(
        '"../config/environment"',
        JSON.stringify(environmentUrl),
      ),
      "account-api",
    )
  );
}

function recordRequests() {
  const requests = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ method: init?.method ?? "GET", url: String(input) });
    return new Response(JSON.stringify({ errors: [] }), {
      headers: { "Content-Type": "application/json" },
      status: 404,
    });
  };
  return requests;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of [
    ["NEXT_PUBLIC_API_URL", originalApiUrl],
    ["NEXT_PUBLIC_BASE_PATH", originalBasePath],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("a GitHub Pages build sends account requests to the API host, not github.io", async () => {
  const { accountApi } = await loadAccountApi({
    apiUrl: PRODUCTION_API_URL,
    basePath: "/SewnCovers",
  });
  const requests = recordRequests();

  await assert.rejects(accountApi.register("a@example.invalid", "x".repeat(12)));
  await assert.rejects(accountApi.login("a@example.invalid", "x".repeat(12)));

  assert.deepEqual(requests, [
    { method: "POST", url: `${PRODUCTION_API_URL}/auth/register` },
    { method: "POST", url: `${PRODUCTION_API_URL}/auth/login` },
  ]);
  for (const { url } of requests) {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "sewncovers-api.onrender.com");
    assert.notEqual(parsed.hostname, PAGES_HOST);
    assert.ok(!parsed.pathname.startsWith("/SewnCovers"), "base path never leaks into API paths");
  }
});

test("a trailing slash on the configured API URL never doubles up in account paths", async () => {
  const { accountApi } = await loadAccountApi({
    apiUrl: `${PRODUCTION_API_URL}///`,
    basePath: "/SewnCovers",
  });
  const requests = recordRequests();

  await assert.rejects(accountApi.register("a@example.invalid", "x".repeat(12)));

  assert.equal(requests[0].url, `${PRODUCTION_API_URL}/auth/register`);
});

test("the API client surfaces a 404 with a stable code and distinguishes network failures", async () => {
  const { accountApi, AccountApiError } = await loadAccountApi({
    apiUrl: PRODUCTION_API_URL,
    basePath: "",
  });
  recordRequests();

  await assert.rejects(
    accountApi.register("a@example.invalid", "x".repeat(12)),
    (error) =>
      error instanceof AccountApiError &&
      error.status === 404 &&
      error.code === "request_failed",
  );

  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(
    accountApi.login("a@example.invalid", "x".repeat(12)),
    (error) =>
      error instanceof AccountApiError &&
      error.status === 0 &&
      error.code === "network_error",
  );
});
