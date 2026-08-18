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
const designSaveSource = readFileSync(
  new URL("./design-save.ts", import.meta.url),
  "utf8",
);
const coverOptionsSource = readFileSync(
  new URL("../data/cover-options.ts", import.meta.url),
  "utf8",
);
const saveSharePanelSource = readFileSync(
  new URL(
    "../components/configurator/save-share-panel.tsx",
    import.meta.url,
  ),
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

function dataModule(source, label) {
  moduleSequence += 1;
  return `data:text/javascript;base64,${Buffer.from(source).toString(
    "base64",
  )}#${label}-${moduleSequence}`;
}

async function loadDesignSave() {
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
  const compiled = transpile(designSaveSource)
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

  return import(dataModule(compiled, "design-save"));
}

function configuration(overrides = {}) {
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
    ...overrides,
  };
}

function createdDesign(request, overrides = {}) {
  return {
    ...request,
    publicId: "AbCdEfGhIjKlMnOpQrSt_1",
    ...overrides,
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

test("maps every reviewed cushion shape to only backend-owned public fields", async () => {
  const { mapConfigurationToCreateDesign } = await loadDesignSave();
  const cases = [
    configuration({
      shape: "square",
      width: 50,
      height: 50,
      thickness: 6,
    }),
    configuration({
      shape: "rectangle",
      width: 65.5,
      height: 40.25,
      thickness: 7,
    }),
    configuration({
      shape: "box",
      width: 180,
      height: 60,
      thickness: 12.5,
    }),
  ];

  for (const value of cases) {
    const input = {
      ...value,
      internalDraft: "must-not-leave-the-browser",
      selectedPatternMetadata: { name: "must not be submitted" },
    };
    const mapped = mapConfigurationToCreateDesign(input);

    assert.deepEqual(mapped, value);
    assert.deepEqual(Object.keys(mapped), [
      "shape",
      "width",
      "height",
      "thickness",
      "unit",
      "patternId",
      "patternScale",
      "backWidth",
      "materialId",
      "fitPreference",
      "closureType",
      "seamStyle",
    ]);
    assert.equal(Object.isFrozen(mapped), true);
  }
});

test("refuses incomplete or contract-incompatible configurations before saving", async () => {
  const {
    InvalidReviewedConfigurationError,
    mapConfigurationToCreateDesign,
  } = await loadDesignSave();
  const invalidConfigurations = [
    configuration({ shape: null }),
    configuration({ patternId: null }),
    configuration({ patternId: "Fern Trail" }),
    configuration({ width: 45.123 }),
    configuration({ patternScale: 1.23 }),
    configuration({ shape: "square", width: 45, height: 44 }),
  ];

  for (const value of invalidConfigurations) {
    assert.throws(
      () => mapConfigurationToCreateDesign(value),
      InvalidReviewedConfigurationError,
    );
  }
});

test("saves once, publishes accessible progress data, and uses the returned public ID", async () => {
  const { DesignSaveController } = await loadDesignSave();
  const pending = deferred();
  const calls = [];
  const client = {
    async createDesign(request, options) {
      calls.push(request);
      options.onStatus({
        message: "Connecting to SewnCovers\u2026",
        state: "connecting",
      });
      return pending.promise;
    },
  };
  const controller = new DesignSaveController(
    client,
    (publicId) =>
      `https://example.test/configure/?design=${encodeURIComponent(
        publicId,
      )}`,
  );
  const states = [];
  controller.subscribe((state) => states.push(state));
  const value = configuration();

  const firstSubmission = controller.submit(value);
  const duplicateSubmission = controller.submit(value);

  assert.equal(calls.length, 1);
  assert.equal(controller.getSnapshot().phase, "saving");

  pending.resolve(createdDesign(calls[0]));
  await Promise.all([firstSubmission, duplicateSubmission]);

  assert.equal(calls.length, 1);
  assert.deepEqual(controller.getSnapshot(), {
    message: "Design saved. Your share link is ready.",
    phase: "success",
    publicId: "AbCdEfGhIjKlMnOpQrSt_1",
    shareUrl:
      "https://example.test/configure/?design=AbCdEfGhIjKlMnOpQrSt_1",
  });
  assert.deepEqual(
    states.map(({ phase }) => phase),
    ["saving", "saving", "success"],
  );

  await controller.submit(value);
  assert.equal(calls.length, 1);
});

test("preserves configuration through a single-attempt failure and explicit recovery", async () => {
  const { DesignSaveController } = await loadDesignSave();
  let calls = 0;
  const submitted = [];
  const client = {
    async createDesign(request, options) {
      calls += 1;
      submitted.push(request);

      if (calls === 1) {
        options.onStatus({
          category: "network",
          message:
            "The SewnCovers API could not be reached. Check your connection and try again.",
          state: "failure",
        });
        throw new Error("private network detail");
      }

      return createdDesign(request);
    },
  };
  const controller = new DesignSaveController(
    client,
    (publicId) =>
      `https://example.test/configure/?design=${publicId}`,
  );
  const value = configuration();
  const beforeSave = structuredClone(value);

  await controller.submit(value);

  assert.equal(calls, 1);
  assert.equal(controller.getSnapshot().phase, "error");
  assert.match(controller.getSnapshot().message, /could not be reached/i);
  assert.deepEqual(value, beforeSave);

  await controller.submit(value);

  assert.equal(calls, 2);
  assert.deepEqual(submitted, [beforeSave, beforeSave]);
  assert.equal(controller.getSnapshot().phase, "success");
  assert.deepEqual(value, beforeSave);
});

test("rejects malformed or mismatched creation responses without producing a link", async () => {
  const { DesignSaveController } = await loadDesignSave();
  const malformedResponses = [
    { publicId: "too-short" },
    createdDesign(configuration(), { publicId: "too-short" }),
    createdDesign(configuration(), { width: 99 }),
    {
      ...createdDesign(configuration()),
      internalId: 42,
    },
  ];

  for (const response of malformedResponses) {
    let shareUrlCalls = 0;
    const controller = new DesignSaveController(
      {
        async createDesign() {
          return response;
        },
      },
      () => {
        shareUrlCalls += 1;
        return "must-not-be-used";
      },
    );

    await controller.submit(configuration());

    assert.equal(controller.getSnapshot().phase, "error");
    assert.match(controller.getSnapshot().message, /could not be verified/i);
    assert.equal(shareUrlCalls, 0);
  }
});

test("builds encoded links for ordinary and GitHub Pages base paths", async () => {
  const { buildDesignShareUrl } = await loadDesignSave();

  assert.equal(
    buildDesignShareUrl(
      "opaque id/+?",
      "https://example.test/",
    ),
    "https://example.test/configure/?design=opaque%20id%2F%2B%3F",
  );
  assert.equal(
    buildDesignShareUrl(
      "AbCdEfGhIjKlMnOpQrSt_1",
      "https://portfolio.example",
      "/sewncovers/",
    ),
    "https://portfolio.example/sewncovers/configure/?design=AbCdEfGhIjKlMnOpQrSt_1",
  );
});

test("copies the exact link once and reports unavailable or rejected clipboard access", async () => {
  const {
    copyDesignShareUrl,
    DesignShareClipboardError,
  } = await loadDesignSave();
  const copied = [];
  const shareUrl =
    "https://example.test/configure/?design=AbCdEfGhIjKlMnOpQrSt_1";

  await copyDesignShareUrl(shareUrl, {
    async writeText(value) {
      copied.push(value);
    },
  });

  assert.deepEqual(copied, [shareUrl]);
  await assert.rejects(
    copyDesignShareUrl(shareUrl, undefined),
    DesignShareClipboardError,
  );
  await assert.rejects(
    copyDesignShareUrl(shareUrl, {
      async writeText() {
        throw new Error("private clipboard detail");
      },
    }),
    (error) =>
      error instanceof DesignShareClipboardError &&
      !/private clipboard detail/.test(error.message),
  );
});

test("save/share UI declares labeled, announced, retry, and manual-copy recovery states", () => {
  assert.match(
    saveSharePanelSource,
    /aria-labelledby="configuration-save-share-heading"/,
  );
  assert.match(saveSharePanelSource, /loadingLabel="Saving design/);
  assert.match(saveSharePanelSource, /role="status"/);
  assert.match(saveSharePanelSource, /aria-live="polite"/);
  assert.match(saveSharePanelSource, /<ErrorMessage>/);
  assert.match(saveSharePanelSource, /Try saving again/);
  assert.match(saveSharePanelSource, /onSavingChange\(true\)/);
  assert.match(
    saveSharePanelSource,
    /finally\(\(\) => onSavingChange\(false\)\)/,
  );
  assert.match(
    saveSharePanelSource,
    /htmlFor="configuration-share-url"/,
  );
  assert.match(saveSharePanelSource, /readOnly/);
  assert.match(saveSharePanelSource, /Copy share link/);
  assert.match(saveSharePanelSource, /shareUrlInput\.current\?\.select/);
  assert.match(saveSharePanelSource, /copy it manually/);
});
