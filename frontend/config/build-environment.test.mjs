import assert from "node:assert/strict";
import { test } from "node:test";

import { importFreshTogether } from "../tests/fresh-import.mjs";

// One copy of both modules, so the errors build-environment.ts throws are
// instances of the PublicEnvironmentError imported here.
const [
  { createBuildEnvironment, PRODUCTION_API_URL },
  { PublicEnvironmentError },
] = await importFreshTogether(
  ["./build-environment.ts", "./environment.ts"],
  import.meta.url,
);

test("selects only the exact Render API for GitHub Pages production", () => {
  const configuration = createBuildEnvironment(
    `${PRODUCTION_API_URL}/`,
    "github-pages",
  );

  assert.deepEqual(configuration, { apiUrl: PRODUCTION_API_URL });
});

test("fails closed when a Pages build omits or changes the production API", () => {
  for (const value of [
    undefined,
    "http://localhost:8000",
    "https://sewncovers-api.onrender.com.example",
    "https://sewncovers-api.onrender.com:4430",
    "http://sewncovers-api.onrender.com",
    `${PRODUCTION_API_URL}/v1`,
  ]) {
    assert.throws(
      () => createBuildEnvironment(value, "github-pages"),
      (error) =>
        error instanceof PublicEnvironmentError &&
        error.category === "configuration" &&
        error.message.includes(PRODUCTION_API_URL) &&
        !error.message.includes(String(value)),
    );
  }
});

test("keeps ordinary build selection independent from production", () => {
  assert.deepEqual(
    createBuildEnvironment("http://localhost:8000", "ordinary"),
    { apiUrl: "http://localhost:8000" },
  );
  assert.deepEqual(
    createBuildEnvironment("http://api.sewncovers.test", "ordinary"),
    { apiUrl: "http://api.sewncovers.test" },
  );
});
