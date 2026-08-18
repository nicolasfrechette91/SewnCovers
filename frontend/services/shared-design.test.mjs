import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import ts from "typescript";

const measurementSource = readFileSync(
  new URL("../context/configuration/measurements.ts", import.meta.url),
  "utf8",
);
const patternScaleSource = readFileSync(
  new URL("../context/configuration/pattern-scale.ts", import.meta.url),
  "utf8",
);
const sharedDesignSource = readFileSync(
  new URL("./shared-design.ts", import.meta.url),
  "utf8",
);
const coverOptionsSource = readFileSync(
  new URL("../data/cover-options.ts", import.meta.url),
  "utf8",
);
const sharedDesignLoaderSource = readFileSync(
  new URL(
    "../components/configurator/shared-design-loader.tsx",
    import.meta.url,
  ),
  "utf8",
);
const reducerSource = readFileSync(
  new URL("../context/configuration/reducer.ts", import.meta.url),
  "utf8",
);
let moduleSequence = 0;

function transpile(source) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });

  assert.deepEqual(result.diagnostics, []);
  return result.outputText;
}

function dataModule(source, label) {
  moduleSequence += 1;
  return `data:text/javascript;base64,${Buffer.from(source).toString(
    "base64",
  )}#${label}-${moduleSequence}`;
}

async function loadSharedDesign() {
  const measurementUrl = dataModule(
    transpile(measurementSource),
    "measurements",
  );
  const patternScaleUrl = dataModule(
    transpile(patternScaleSource),
    "pattern-scale",
  );
  const coverOptionsUrl = dataModule(
    transpile(coverOptionsSource),
    "cover-options",
  );
  const compiled = transpile(sharedDesignSource)
    .replace(
      '"../context/configuration/measurements"',
      JSON.stringify(measurementUrl),
    )
    .replace(
      '"../context/configuration/pattern-scale"',
      JSON.stringify(patternScaleUrl),
    )
    .replace(
      '"../data/cover-options"',
      JSON.stringify(coverOptionsUrl),
    );

  return import(dataModule(compiled, "shared-design"));
}

async function loadReducer() {
  const measurementUrl = dataModule(
    transpile(measurementSource),
    "measurements",
  );
  const patternScaleUrl = dataModule(
    transpile(patternScaleSource),
    "pattern-scale",
  );
  const coverOptionsUrl = dataModule(
    transpile(coverOptionsSource),
    "cover-options",
  );
  const compiled = transpile(reducerSource)
    .replace('"./measurements"', JSON.stringify(measurementUrl))
    .replace('"./pattern-scale"', JSON.stringify(patternScaleUrl))
    .replace(
      '"../../data/cover-options"',
      JSON.stringify(coverOptionsUrl),
    );

  return import(dataModule(compiled, "reducer"));
}

const publicId = "AbCdEfGhIjKlMnOpQrSt_1";

function design(overrides = {}) {
  return {
    shape: "rectangle",
    width: 45.25,
    height: 55.5,
    backWidth: null,
    thickness: 8.75,
    unit: "cm",
    patternId: "fern-trail",
    patternScale: 1.2,
    materialId: "cotton-canvas",
    fitPreference: "standard",
    closureType: "zipper",
    seamStyle: "plain",
    publicId,
    ...overrides,
  };
}

function readyCatalogue(patternId = "fern-trail") {
  return {
    patterns: [{ id: patternId }],
    status: "ready",
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

async function settle() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

function createHarness(SharedDesignController, getDesign) {
  let revision = 0;
  const restored = [];
  const calls = [];
  const client = {
    async getDesign(requestedId, options) {
      calls.push(requestedId);
      return getDesign(requestedId, options, calls.length);
    },
  };
  const controller = new SharedDesignController(
    client,
    (configuration) => {
      restored.push(configuration);
      revision += 1;
    },
    () => revision,
  );

  return {
    calls,
    controller,
    edit() {
      revision += 1;
      controller.configurationChanged();
    },
    restored,
  };
}

test("reads one safely decoded public ID on ordinary and GitHub Pages paths", async () => {
  const { readSharedDesignId, SharedDesignController } =
    await loadSharedDesign();
  const encodedId = "%41bCdEfGhIjKlMnOpQrSt%5F1";
  const urls = [
    new URL(`https://example.test/configure/?design=${encodedId}`),
    new URL(
      `https://example.test/sewncovers/configure/?design=${encodedId}`,
    ),
  ];
  const harness = createHarness(
    SharedDesignController,
    async () => design(),
  );

  for (const url of urls) {
    assert.deepEqual(readSharedDesignId(url.search), {
      publicId,
      status: "valid",
    });
    harness.controller.start(url.search, readyCatalogue());
    await settle();
  }
  assert.deepEqual(harness.calls, [publicId, publicId]);
  assert.equal(harness.restored.length, 2);
  assert.deepEqual(readSharedDesignId("?source=portfolio"), {
    status: "none",
  });
});

test("rejects empty, duplicate, malformed, truncated, and invalidly encoded IDs", async () => {
  const { readSharedDesignId, SharedDesignController } =
    await loadSharedDesign();
  const harness = createHarness(
    SharedDesignController,
    async () => design(),
  );
  const malformedSearches = [
    "?design=",
    "?design=short",
    "?design=AbCdEfGhIjKlMnOpQrSt%2F1",
    "?design=%E0%A4%A",
    `?design=${publicId}&design=${publicId}`,
  ];

  for (const search of malformedSearches) {
    assert.deepEqual(readSharedDesignId(search), {
      status: "malformed",
    });
    harness.controller.start(search, readyCatalogue());
    assert.equal(
      harness.controller.getSnapshot().phase,
      "malformed-id",
    );
  }
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.restored, []);
});

test("exactly restores every shape and both units with decimal values", async () => {
  const { SharedDesignController } = await loadSharedDesign();
  const cases = [
    design({
      shape: "square",
      width: 40.25,
      height: 40.25,
      thickness: 5.5,
      unit: "cm",
      patternScale: 0.7,
    }),
    design({
      shape: "rectangle",
      width: 23.75,
      height: 17.25,
      thickness: 3.5,
      unit: "in",
      patternScale: 1.3,
    }),
    design({
      shape: "box",
      width: 180.5,
      height: 60.25,
      thickness: 12.75,
      unit: "cm",
      patternScale: 2,
    }),
    design({
      shape: "box",
      width: 70.25,
      height: 23.5,
      thickness: 4.75,
      unit: "in",
      patternScale: 0.5,
    }),
    design({
      shape: "round",
      width: 50.25,
      height: 50.25,
      thickness: 8.5,
      unit: "cm",
      patternScale: 1.1,
    }),
    design({
      shape: "tapered",
      width: 31.5,
      height: 21.65,
      backWidth: 25.6,
      thickness: 3.95,
      unit: "in",
      materialId: "linen-blend",
      fitPreference: "relaxed",
      closureType: "envelope",
      seamStyle: "piped",
    }),
  ];

  for (const response of cases) {
    const harness = createHarness(
      SharedDesignController,
      async () => response,
    );
    harness.controller.start(
      `?design=${encodeURIComponent(publicId)}`,
      readyCatalogue(),
    );
    await settle();

    const expected = { ...response };
    delete expected.publicId;
    assert.deepEqual(harness.restored, [expected]);
    assert.deepEqual(Object.keys(harness.restored[0]), [
      "shape",
      "width",
      "height",
      "backWidth",
      "thickness",
      "unit",
      "patternId",
      "patternScale",
      "materialId",
      "fitPreference",
      "closureType",
      "seamStyle",
    ]);
    assert.equal(Object.isFrozen(harness.restored[0]), true);
    assert.equal(
      harness.controller.getSnapshot().phase,
      "restored",
    );
  }
});

test("restores legacy responses with safe cover-detail defaults", async () => {
  const { SharedDesignController } = await loadSharedDesign();
  const legacy = design();
  delete legacy.backWidth;
  delete legacy.materialId;
  delete legacy.fitPreference;
  delete legacy.closureType;
  delete legacy.seamStyle;
  const harness = createHarness(
    SharedDesignController,
    async () => legacy,
  );

  harness.controller.start(`?design=${publicId}`, readyCatalogue());
  await settle();

  assert.deepEqual(harness.restored, [{
    shape: legacy.shape,
    width: legacy.width,
    height: legacy.height,
    backWidth: null,
    thickness: legacy.thickness,
    unit: legacy.unit,
    patternId: legacy.patternId,
    patternScale: legacy.patternScale,
    materialId: "cotton-canvas",
    fitPreference: "standard",
    closureType: "zipper",
    seamStyle: "plain",
  }]);
});

test("waits for the API catalogue before restoring a valid pattern", async () => {
  const { SharedDesignController } = await loadSharedDesign();
  const response = deferred();
  const harness = createHarness(
    SharedDesignController,
    async (_id, options) => {
      options.onStatus({
        message:
          "The SewnCovers API may be waking up. This can take up to a minute.",
        state: "cold-start",
      });
      return response.promise;
    },
  );

  harness.controller.start(`?design=${publicId}`, {
    status: "loading",
  });
  assert.equal(harness.controller.getSnapshot().phase, "loading");
  assert.match(
    harness.controller.getSnapshot().message,
    /may be waking up/i,
  );

  response.resolve(design());
  await settle();
  assert.equal(
    harness.controller.getSnapshot().phase,
    "waiting-patterns",
  );
  assert.deepEqual(harness.restored, []);

  harness.controller.updateCatalogue(readyCatalogue());
  assert.equal(harness.controller.getSnapshot().phase, "restored");
  assert.equal(harness.restored.length, 1);
});

test("ignores a late response after a user edit", async () => {
  const { SharedDesignController } = await loadSharedDesign();
  const pending = deferred();
  const harness = createHarness(
    SharedDesignController,
    async () => pending.promise,
  );

  harness.controller.start(`?design=${publicId}`, readyCatalogue());
  harness.edit();
  assert.equal(
    harness.controller.getSnapshot().phase,
    "superseded",
  );

  pending.resolve(design());
  await settle();
  assert.deepEqual(harness.restored, []);
  assert.equal(
    harness.controller.getSnapshot().phase,
    "superseded",
  );
});

test("preserves an edit made while a retrieved design waits for patterns", async () => {
  const { SharedDesignController } = await loadSharedDesign();
  const harness = createHarness(
    SharedDesignController,
    async () => design(),
  );

  harness.controller.start(`?design=${publicId}`, {
    status: "loading",
  });
  await settle();
  assert.equal(
    harness.controller.getSnapshot().phase,
    "waiting-patterns",
  );

  harness.edit();
  harness.controller.updateCatalogue(readyCatalogue());
  assert.deepEqual(harness.restored, []);
  assert.equal(
    harness.controller.getSnapshot().phase,
    "superseded",
  );
});

test("rejects malformed or mismatched retrieval responses without exposing fields", async () => {
  const { SharedDesignController } = await loadSharedDesign();
  const malformedResponses = [
    design({ publicId: "ZbCdEfGhIjKlMnOpQrSt_1" }),
    design({ internalDatabaseId: 42 }),
    design({ shape: "square", width: 40, height: 39 }),
    design({ width: 45.123 }),
    design({ patternScale: 1.23 }),
  ];

  for (const response of malformedResponses) {
    const harness = createHarness(
      SharedDesignController,
      async () => response,
    );
    harness.controller.start(`?design=${publicId}`, readyCatalogue());
    await settle();

    assert.equal(
      harness.controller.getSnapshot().phase,
      "malformed-response",
    );
    assert.doesNotMatch(
      harness.controller.getSnapshot().message,
      /internalDatabaseId|42/,
    );
    assert.deepEqual(harness.restored, []);
  }
});

test("handles unknown or expired IDs without retry loops or local mutation", async () => {
  const { SharedDesignController } = await loadSharedDesign();
  const notFound = Object.assign(new Error("private repository detail"), {
    errors: [{ code: "design_not_found" }],
    status: 404,
  });
  const harness = createHarness(SharedDesignController, async () => {
    throw notFound;
  });

  harness.controller.start(`?design=${publicId}`, readyCatalogue());
  await settle();

  assert.equal(harness.controller.getSnapshot().phase, "not-found");
  assert.match(
    harness.controller.getSnapshot().message,
    /unknown or has expired/i,
  );
  assert.doesNotMatch(
    harness.controller.getSnapshot().message,
    /private repository detail/i,
  );
  assert.deepEqual(harness.restored, []);
  assert.deepEqual(harness.calls, [publicId]);
});

test("supports explicit request retry and pattern-load recovery", async () => {
  const { SharedDesignController } = await loadSharedDesign();
  const harness = createHarness(
    SharedDesignController,
    async (_id, _options, call) => {
      if (call === 1) {
        throw new TypeError("private network detail");
      }
      return design();
    },
  );

  harness.controller.start(`?design=${publicId}`, readyCatalogue());
  await settle();
  assert.equal(harness.controller.getSnapshot().phase, "error");
  assert.deepEqual(harness.restored, []);

  harness.controller.retry();
  await settle();
  assert.equal(harness.controller.getSnapshot().phase, "restored");
  assert.deepEqual(harness.calls, [publicId, publicId]);

  const catalogueHarness = createHarness(
    SharedDesignController,
    async () => design(),
  );
  catalogueHarness.controller.start(`?design=${publicId}`, {
    issues: ["fixed public issue"],
    status: "error",
  });
  await settle();
  assert.equal(
    catalogueHarness.controller.getSnapshot().phase,
    "catalogue-error",
  );
  catalogueHarness.controller.updateCatalogue(readyCatalogue());
  assert.equal(
    catalogueHarness.controller.getSnapshot().phase,
    "restored",
  );
  assert.equal(catalogueHarness.restored.length, 1);
});

test("reports unavailable patterns and can recover when the catalogue changes", async () => {
  const { SharedDesignController } = await loadSharedDesign();
  const harness = createHarness(
    SharedDesignController,
    async () => design(),
  );

  harness.controller.start(
    `?design=${publicId}`,
    readyCatalogue("different-pattern"),
  );
  await settle();
  assert.equal(
    harness.controller.getSnapshot().phase,
    "pattern-unavailable",
  );
  assert.deepEqual(harness.restored, []);

  harness.controller.updateCatalogue(readyCatalogue());
  assert.equal(harness.controller.getSnapshot().phase, "restored");
  assert.equal(harness.restored.length, 1);
});

test("the atomic reducer restore does not convert units or partially accept invalid data", async () => {
  const { configurationReducer, initialConfigurationState } =
    await loadReducer();
  const exact = {
    shape: "rectangle",
    width: 23.75,
    height: 17.25,
    backWidth: null,
    thickness: 3.5,
    unit: "in",
    patternId: "fern-trail",
    patternScale: 1.3,
    materialId: "cotton-canvas",
    fitPreference: "standard",
    closureType: "zipper",
    seamStyle: "plain",
  };

  assert.deepEqual(
    configurationReducer(initialConfigurationState, {
      configuration: exact,
      type: "restoreConfiguration",
    }),
    exact,
  );
  assert.equal(
    configurationReducer(exact, {
      configuration: {
        ...exact,
        width: 23.123,
      },
      type: "restoreConfiguration",
    }),
    exact,
  );
});

test("shared-design UI declares loading, success, retry, and continue recovery states", () => {
  assert.match(
    sharedDesignLoaderSource,
    /aria-labelledby="shared-design-status-heading"/,
  );
  assert.match(sharedDesignLoaderSource, /<LoadingState/);
  assert.match(sharedDesignLoaderSource, /role="status"/);
  assert.match(sharedDesignLoaderSource, /aria-live="polite"/);
  assert.match(sharedDesignLoaderSource, /<ErrorMessage/);
  assert.match(
    sharedDesignLoaderSource,
    /Try loading the shared design again/,
  );
  assert.match(sharedDesignLoaderSource, /Try loading patterns again/);
  assert.match(
    sharedDesignLoaderSource,
    /Continue with my configuration/,
  );
  assert.match(sharedDesignLoaderSource, /history\.replaceState/);
  assert.doesNotMatch(sharedDesignLoaderSource, /createDesign|saveDesign/);
});
