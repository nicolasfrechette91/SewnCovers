import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const productionApiUrl = "https://sewncovers-api.onrender.com";
const productionFrontendOrigin = "https://nicolasfrechette91.github.io";
const repositoryRoot = new URL("../../", import.meta.url);

const [pagesWorkflow, ciWorkflow, renderBlueprint] = await Promise.all([
  readFile(new URL(".github/workflows/deploy-pages.yml", repositoryRoot), "utf8"),
  readFile(new URL(".github/workflows/ci.yml", repositoryRoot), "utf8"),
  readFile(new URL("render.yaml", repositoryRoot), "utf8"),
]);

test("Pages and CI production builds declare the exact public Render API URL", () => {
  assert.match(
    pagesWorkflow,
    new RegExp(`NEXT_PUBLIC_API_URL: ${productionApiUrl}`),
  );
  assert.match(
    ciWorkflow,
    new RegExp(`NEXT_PUBLIC_API_URL: ${productionApiUrl}`),
  );
  assert.doesNotMatch(
    pagesWorkflow,
    /localhost|api\.sewncovers\.test|SEWNCOVERS_E2E|secrets\.|DATABASE_URL|FRONTEND_ORIGIN/,
  );
  assert.doesNotMatch(ciWorkflow, /SEWNCOVERS_E2E/);
});

test("Render production declares only the exact path-free Pages browser origin", () => {
  assert.match(renderBlueprint, /- key: ENVIRONMENT\s+value: production/);
  assert.match(
    renderBlueprint,
    new RegExp(`- key: FRONTEND_ORIGIN\\s+value: ${productionFrontendOrigin}`),
  );
  assert.doesNotMatch(
    renderBlueprint,
    /FRONTEND_ORIGIN\s+value:.*(?:SewnCovers|onrender\.com|localhost|\*)/,
  );
});

test("public deployment configuration remains secret-free", () => {
  for (const source of [pagesWorkflow, ciWorkflow]) {
    assert.doesNotMatch(
      source,
      /postgres(?:ql)?(:|%3A)|private[-_](?:key|token)|password\s*[:=]/i,
    );
  }

  assert.match(renderBlueprint, /- key: DATABASE_URL\s+sync: false/);
  assert.doesNotMatch(
    renderBlueprint,
    /DATABASE_URL\s+(?:value|fromDatabase):|postgres(?:ql)?(:|%3A)/i,
  );
});
