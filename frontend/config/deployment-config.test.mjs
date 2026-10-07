import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const productionApiUrl = "https://sewncovers-api.onrender.com";
const productionFrontendOrigin = "https://nicolasfrechette91.github.io";
const repositoryRoot = new URL("../../", import.meta.url);

const [pagesWorkflow, ciWorkflow, renderBlueprint, rootReadme] = await Promise.all([
  readFile(new URL(".github/workflows/deploy-pages.yml", repositoryRoot), "utf8"),
  readFile(new URL(".github/workflows/ci.yml", repositoryRoot), "utf8"),
  readFile(new URL("render.yaml", repositoryRoot), "utf8"),
  readFile(new URL("README.md", repositoryRoot), "utf8"),
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

// Fenced blocks and inline code spans are not links, so drop them before parsing.
function withoutCode(markdown) {
  let fence = null;
  const prose = [];
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence === null) {
      if (marker) fence = marker;
      else prose.push(line);
    } else if (marker?.[0] === fence[0] && marker.length >= fence.length) {
      fence = null;
    }
  }
  return prose.join("\n").replace(/(`+)[^`]*?\1/g, "");
}

// Every inline link or image destination (including an image nested in a link)
// and every reference definition, minus remote URLs and pure #anchors, with any
// #fragment removed.
function localMarkdownTargets(markdown) {
  const prose = withoutCode(markdown);
  return [
    ...prose.matchAll(/\]\(\s*(?:<([^>\n]*)>|([^\s)]*))/g),
    ...prose.matchAll(/^ {0,3}\[[^\]\n]+\]:[ \t]*(?:<([^>\n]*)>|(\S+))/gm),
  ]
    .map((match) => match[1] ?? match[2])
    .filter((destination) => !/^(?:https?:|mailto:|#)/i.test(destination))
    .map((destination) => destination.split("#", 1)[0])
    .filter((target) => target !== "")
    .map((target) => {
      try {
        return decodeURIComponent(target);
      } catch {
        return target;
      }
    });
}

test("root documentation keeps every repository-local Markdown target resolvable", async () => {
  const targets = [...new Set(localMarkdownTargets(rootReadme))];
  assert.ok(targets.length > 0, "Expected repository-local README links.");

  const repositoryPath = fileURLToPath(repositoryRoot);
  const exists = await Promise.all(
    targets.map((target) =>
      access(path.join(repositoryPath, target)).then(
        () => true,
        () => false,
      ),
    ),
  );
  const missing = targets.filter((_, index) => !exists[index]);

  assert.deepEqual(
    missing,
    [],
    `README.md links to targets missing from the repository:\n${missing.map((target) => `  - ${target}`).join("\n")}`,
  );
});
