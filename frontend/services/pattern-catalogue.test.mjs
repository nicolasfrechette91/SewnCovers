import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import ts from "typescript";

const patternsSource = readFileSync(
  new URL("../data/patterns.ts", import.meta.url),
  "utf8",
);
const catalogueSource = readFileSync(
  new URL("./pattern-catalogue.ts", import.meta.url),
  "utf8",
);
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

async function loadCatalogueModule() {
  moduleSequence += 1;
  const patternsUrl = `data:text/javascript;base64,${Buffer.from(
    transpile(patternsSource),
  ).toString("base64")}#patterns-${moduleSequence}`;
  const compiledCatalogue = transpile(catalogueSource).replace(
    '"../data/patterns"',
    JSON.stringify(patternsUrl),
  );
  const catalogueUrl = `data:text/javascript;base64,${Buffer.from(
    compiledCatalogue,
  ).toString("base64")}#catalogue-${moduleSequence}`;

  return import(catalogueUrl);
}

const patternRecords = [
  ["prototype-botanical", "botanical", ["ivory", "green"]],
  ["fern-trail", "botanical", ["ivory", "green"]],
  ["meadow-sprig", "botanical", ["ivory", "blue", "gold"]],
  ["prototype-geometric", "geometric", ["ivory", "terracotta"]],
  ["diamond-path", "geometric", ["ivory", "blue", "charcoal"]],
  ["arch-grid", "geometric", ["ivory", "terracotta", "gold"]],
  ["harbor-stripe", "striped", ["ivory", "blue"]],
  ["orchard-stripe", "striped", ["ivory", "green", "gold"]],
  ["ribbon-stripe", "striped", ["ivory", "terracotta", "rose"]],
  ["prototype-woven", "woven", ["ivory", "charcoal"]],
  ["basket-check", "woven", ["ivory", "blue", "charcoal"]],
  ["linen-crosshatch", "woven", ["ivory", "gold"]],
  ["terrace-wave", "abstract", ["ivory", "green", "blue"]],
  ["pebble-drift", "abstract", ["ivory", "terracotta", "charcoal"]],
  ["confetti-grid", "abstract", ["ivory", "green", "gold", "rose"]],
];

function patternResponse(
  [id, categoryId, colorIds],
  overrides = {},
) {
  return {
    id,
    name: `API ${id}`,
    description: `API description for ${id}.`,
    categoryId,
    colorIds,
    previewClassName: `backend-${id}`,
    ...overrides,
  };
}

function completeCatalogue() {
  return patternRecords.map((record) => patternResponse(record));
}

function createMockClient(handler) {
  const requests = [];
  const client = {
    async listPatterns(query, options) {
      requests.push(query);
      return handler(query, options, requests.length);
    },
  };

  return { client, requests };
}

function filterResponses(patterns, query) {
  return patterns.filter(
    (pattern) =>
      (query.category === undefined ||
        pattern.categoryId === query.category) &&
      (query.color === undefined ||
        pattern.colorIds.includes(query.color)),
  );
}

function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

test("loads API metadata in response order and resolves artwork by stable ID", async () => {
  const { PatternCatalogueController } = await loadCatalogueModule();
  const response = completeCatalogue().reverse();
  const { client, requests } = createMockClient(async () => response);
  const controller = new PatternCatalogueController(client);

  await controller.loadInitial();

  assert.deepEqual(requests, [
    { category: undefined, color: undefined },
  ]);
  assert.equal(controller.getSnapshot().phase, "ready");
  assert.deepEqual(
    controller.getSnapshot().visiblePatterns.map(({ id }) => id),
    response.map(({ id }) => id),
  );
  assert.equal(
    controller.getSnapshot().visiblePatterns.at(-1).name,
    "API prototype-botanical",
  );
  assert.equal(
    controller.getSnapshot().visiblePatterns.at(-1).previewClassName,
    "prototype-pattern-botanical",
  );
  assert.notEqual(
    controller.getSnapshot().visiblePatterns.at(-1).previewClassName,
    response.at(-1).previewClassName,
  );
});

test("sends category, color, and combined filters through the API", async () => {
  const { PatternCatalogueController } = await loadCatalogueModule();
  const patterns = completeCatalogue();
  const { client, requests } = createMockClient(async (query) =>
    filterResponses(patterns, query),
  );
  const controller = new PatternCatalogueController(client);

  await controller.loadInitial();
  await controller.setFilters({
    categoryId: "botanical",
    colorId: "all-colors",
  });
  assert.deepEqual(
    controller.getSnapshot().visiblePatterns.map(({ id }) => id),
    ["prototype-botanical", "fern-trail", "meadow-sprig"],
  );

  await controller.setFilters({
    categoryId: "all-categories",
    colorId: "blue",
  });
  await controller.setFilters({
    categoryId: "geometric",
    colorId: "blue",
  });

  assert.deepEqual(requests.slice(1), [
    { category: "botanical", color: undefined },
    { category: undefined, color: "blue" },
    { category: "geometric", color: "blue" },
  ]);
  assert.deepEqual(
    controller.getSnapshot().visiblePatterns.map(({ id }) => id),
    ["diamond-path"],
  );
});

test("keeps the complete catalogue and a valid selection when filters hide it", async () => {
  const {
    PatternCatalogueController,
  } = await loadCatalogueModule();
  const patterns = completeCatalogue();
  const { client } = createMockClient(async (query) =>
    filterResponses(patterns, query),
  );
  const controller = new PatternCatalogueController(client);

  await controller.loadInitial();
  await controller.setFilters({
    categoryId: "geometric",
    colorId: "all-colors",
  });

  const snapshot = controller.getSnapshot();
  assert.equal(
    snapshot.allPatterns.find(({ id }) => id === "fern-trail").name,
    "API fern-trail",
  );
  assert.equal(
    snapshot.visiblePatterns.some(({ id }) => id === "fern-trail"),
    false,
  );
});

test("represents empty API catalogues and empty filtered results separately", async () => {
  const { PatternCatalogueController } = await loadCatalogueModule();
  const emptyMock = createMockClient(async () => []);
  const emptyController = new PatternCatalogueController(
    emptyMock.client,
  );

  await emptyController.loadInitial();
  assert.equal(emptyController.getSnapshot().phase, "empty");
  assert.deepEqual(emptyController.getSnapshot().allPatterns, []);

  const patterns = completeCatalogue();
  const filteredMock = createMockClient(async (query) =>
    query.category === "abstract" && query.color === "rose"
      ? []
      : patterns,
  );
  const filteredController = new PatternCatalogueController(
    filteredMock.client,
  );
  await filteredController.loadInitial();
  await filteredController.setFilters({
    categoryId: "abstract",
    colorId: "rose",
  });

  assert.equal(filteredController.getSnapshot().phase, "empty");
  assert.equal(filteredController.getSnapshot().allPatterns.length, 15);
  assert.deepEqual(filteredController.getSnapshot().visiblePatterns, []);
});

test("exposes retryable failures and recovers without a local fallback", async () => {
  const { PatternCatalogueController } = await loadCatalogueModule();
  let shouldFail = true;
  const { client, requests } = createMockClient(
    async (_query, options) => {
      if (shouldFail) {
        options.onStatus({
          category: "network",
          message:
            "The SewnCovers API could not be reached. Check your connection and try again.",
          state: "failure",
        });
        throw new Error("mocked network failure");
      }

      return completeCatalogue();
    },
  );
  const controller = new PatternCatalogueController(client);

  await controller.loadInitial();
  assert.equal(controller.getSnapshot().phase, "error");
  assert.equal(controller.getSnapshot().allPatterns.length, 0);
  assert.match(controller.getSnapshot().message, /could not be reached/i);

  shouldFail = false;
  await controller.retry();
  assert.equal(controller.getSnapshot().phase, "ready");
  assert.equal(controller.getSnapshot().allPatterns.length, 15);
  assert.equal(requests.length, 2);
});

test("surfaces cold-start status and recovers when the mocked request resolves", async () => {
  const { PatternCatalogueController } = await loadCatalogueModule();
  const pending = deferred();
  const { client } = createMockClient(
    async (_query, options) => {
      options.onStatus({
        message: "Connecting to SewnCovers\u2026",
        state: "connecting",
      });
      options.onStatus({
        message:
          "The SewnCovers API may be waking up. This can take up to a minute.",
        state: "cold-start",
      });
      return pending.promise;
    },
  );
  const controller = new PatternCatalogueController(client);

  const loading = controller.loadInitial();
  assert.equal(controller.getSnapshot().phase, "loading");
  assert.match(controller.getSnapshot().message, /may be waking up/i);

  pending.resolve(completeCatalogue());
  await loading;
  assert.equal(controller.getSnapshot().phase, "ready");
  assert.equal(controller.getSnapshot().message, "Patterns loaded.");
});

test("ignores stale responses when filters change quickly", async () => {
  const { PatternCatalogueController } = await loadCatalogueModule();
  const categoryRequest = deferred();
  const colorRequest = deferred();
  const patterns = completeCatalogue();
  const { client } = createMockClient(async (query) => {
    if (query.category === "botanical") {
      return categoryRequest.promise;
    }
    if (query.color === "blue") {
      return colorRequest.promise;
    }
    return patterns;
  });
  const controller = new PatternCatalogueController(client);
  await controller.loadInitial();

  const first = controller.setFilters({
    categoryId: "botanical",
    colorId: "all-colors",
  });
  const second = controller.setFilters({
    categoryId: "all-categories",
    colorId: "blue",
  });

  colorRequest.resolve(filterResponses(patterns, { color: "blue" }));
  await second;
  const expectedIds = controller
    .getSnapshot()
    .visiblePatterns.map(({ id }) => id);

  categoryRequest.resolve(
    filterResponses(patterns, { category: "botanical" }),
  );
  await first;

  assert.deepEqual(controller.getSnapshot().filters, {
    categoryId: "all-categories",
    colorId: "blue",
  });
  assert.deepEqual(
    controller.getSnapshot().visiblePatterns.map(({ id }) => id),
    expectedIds,
  );
});

test("rejects semantically malformed responses and missing visual mappings", async () => {
  const { PatternCatalogueController } = await loadCatalogueModule();
  const malformed = completeCatalogue();
  malformed[0] = {
    ...malformed[0],
    categoryId: "private-unknown-category",
  };
  const malformedMock = createMockClient(async () => malformed);
  const malformedController = new PatternCatalogueController(
    malformedMock.client,
  );

  await malformedController.loadInitial();
  assert.equal(malformedController.getSnapshot().phase, "error");
  assert.match(
    malformedController.getSnapshot().issues.join(" "),
    /unknown category/i,
  );
  assert.deepEqual(malformedController.getSnapshot().allPatterns, []);

  const missingArtwork = completeCatalogue();
  missingArtwork[0] = {
    ...missingArtwork[0],
    id: "api-only-pattern",
  };
  const artworkMock = createMockClient(async () => missingArtwork);
  const artworkController = new PatternCatalogueController(
    artworkMock.client,
  );

  await artworkController.loadInitial();
  assert.equal(artworkController.getSnapshot().phase, "error");
  assert.match(
    artworkController.getSnapshot().issues.join(" "),
    /no frontend artwork mapping/i,
  );

  const filterMismatchMock = createMockClient(async (query) =>
    query.category === "geometric"
      ? [completeCatalogue().find(({ id }) => id === "fern-trail")]
      : completeCatalogue(),
  );
  const filterMismatchController = new PatternCatalogueController(
    filterMismatchMock.client,
  );

  await filterMismatchController.loadInitial();
  await filterMismatchController.setFilters({
    categoryId: "geometric",
    colorId: "all-colors",
  });
  assert.equal(filterMismatchController.getSnapshot().phase, "error");
  assert.match(
    filterMismatchController.getSnapshot().issues.join(" "),
    /does not match the requested category/i,
  );
});
