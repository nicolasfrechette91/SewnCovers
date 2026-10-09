import assert from "node:assert/strict";
import { after, test } from "node:test";

import { importFresh } from "../tests/fresh-import.mjs";

const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
process.env.NEXT_PUBLIC_API_URL = "";

// Imported only now: environment.ts reads the variable when it is evaluated.
const {
  createPublicEnvironment,
  parsePublicApiOrigin,
  parsePublicApiUrl,
  PublicEnvironmentError,
} = await importFresh("./environment.ts", import.meta.url);

after(() => {
  if (originalApiUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
    return;
  }

  process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
});

test("accepts absolute HTTP and HTTPS API URLs", () => {
  assert.equal(
    parsePublicApiUrl("http://localhost:8000"),
    "http://localhost:8000",
  );
  assert.equal(
    parsePublicApiUrl("https://api.example.com/v1"),
    "https://api.example.com/v1",
  );
  assert.equal(
    parsePublicApiOrigin("https://api.example.com/v1"),
    "https://api.example.com",
  );
});

test("trims whitespace and removes trailing slashes", () => {
  assert.equal(
    parsePublicApiUrl("  https://api.example.com/v1///  "),
    "https://api.example.com/v1",
  );
});

test("represents an absent optional API URL explicitly", () => {
  assert.equal(parsePublicApiUrl(undefined), undefined);
  assert.equal(parsePublicApiUrl("   "), undefined);
  assert.equal(parsePublicApiOrigin(undefined), undefined);
  assert.equal(parsePublicApiOrigin("   "), undefined);
});

test("rejects malformed URLs and unsupported schemes", () => {
  assert.throws(
    () => parsePublicApiUrl("not a URL"),
    (error) =>
      error instanceof PublicEnvironmentError &&
      error.category === "configuration" &&
      /NEXT_PUBLIC_API_URL/.test(error.message),
  );
  assert.throws(
    () => parsePublicApiUrl("ftp://api.example.com"),
    /NEXT_PUBLIC_API_URL/,
  );
  assert.throws(
    () => parsePublicApiOrigin("not a URL"),
    (error) =>
      error instanceof PublicEnvironmentError &&
      error.category === "configuration" &&
      error.code !== "ERR_INVALID_URL" &&
      /NEXT_PUBLIC_API_URL/.test(error.message),
  );
});

test("rejects credentials, queries, and fragments without echoing input", () => {
  const unsafeValue =
    "https://private-user:private-pass@example.com?token=private";

  assert.throws(
    () => parsePublicApiUrl(unsafeValue),
    (error) => {
      assert.match(error.message, /NEXT_PUBLIC_API_URL/);
      assert.doesNotMatch(error.message, /private-user|private-pass|token/);
      return true;
    },
  );
});

test("returns a frozen public configuration object", () => {
  const configuration = createPublicEnvironment("https://api.example.com/");

  assert.deepEqual(configuration, { apiUrl: "https://api.example.com" });
  assert.equal(Object.isFrozen(configuration), true);
});

test("keeps ordinary development and test API URLs isolated from Pages", () => {
  assert.deepEqual(createPublicEnvironment("http://localhost:8000"), {
    apiUrl: "http://localhost:8000",
  });
  assert.deepEqual(createPublicEnvironment("http://api.sewncovers.test"), {
    apiUrl: "http://api.sewncovers.test",
  });
});
