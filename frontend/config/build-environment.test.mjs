import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import ts from "typescript";

function transpile(sourceUrl) {
  const source = readFileSync(sourceUrl, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  });

  assert.deepEqual(transpiled.diagnostics, []);
  return transpiled.outputText;
}

const environmentSource = transpile(new URL("./environment.ts", import.meta.url));
const environmentUrl = `data:text/javascript;base64,${Buffer.from(environmentSource).toString("base64")}`;
const { PublicEnvironmentError } = await import(environmentUrl);
const buildEnvironmentSource = transpile(
  new URL("./build-environment.ts", import.meta.url),
).replace('from "./environment"', `from "${environmentUrl}"`);
const {
  createBuildEnvironment,
  PRODUCTION_API_URL,
} = await import(
  `data:text/javascript;base64,${Buffer.from(buildEnvironmentSource).toString("base64")}`
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
