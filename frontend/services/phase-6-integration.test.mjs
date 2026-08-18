import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import ts from "typescript";

const measurementSource = readFileSync(
  new URL("../context/configuration/measurements.ts", import.meta.url),
  "utf8",
);
const patternScaleSource = readFileSync(
  new URL(
    "../context/configuration/pattern-scale.ts",
    import.meta.url,
  ),
  "utf8",
);
const patternsSource = readFileSync(
  new URL("../data/patterns.ts", import.meta.url),
  "utf8",
);
const catalogueSource = readFileSync(
  new URL("./pattern-catalogue.ts", import.meta.url),
  "utf8",
);
const designSaveSource = readFileSync(
  new URL("./design-save.ts", import.meta.url),
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

async function loadPhaseSixModules() {
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
  const patternsUrl = dataModule(
    transpile(patternsSource),
    "patterns",
  );
  const catalogueUrl = dataModule(
    transpile(catalogueSource).replace(
      '"../data/patterns"',
      JSON.stringify(patternsUrl),
    ),
    "pattern-catalogue",
  );
  const designSaveUrl = dataModule(
    transpile(designSaveSource)
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
      ),
    "design-save",
  );
  const sharedDesignUrl = dataModule(
    transpile(sharedDesignSource)
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
      ),
    "shared-design",
  );

  const [catalogue, designSave, sharedDesign] = await Promise.all([
    import(catalogueUrl),
    import(designSaveUrl),
    import(sharedDesignUrl),
  ]);

  return { catalogue, designSave, sharedDesign };
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

function completeCatalogue() {
  return patternRecords.map(([id, categoryId, colorIds]) => ({
    id,
    name: `API ${id}`,
    description: `API description for ${id}.`,
    categoryId,
    colorIds,
    previewClassName: `backend-${id}`,
  }));
}

async function settle() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

test("completes catalogue, save, share, and exact restore for every shape", async () => {
  const { catalogue, designSave, sharedDesign } =
    await loadPhaseSixModules();
  const storedDesigns = new Map();
  const calls = { create: 0, get: 0, patterns: 0 };
  const client = {
    async listPatterns() {
      calls.patterns += 1;
      return completeCatalogue();
    },
    async createDesign(request) {
      calls.create += 1;
      const publicId = `Task65Journey${String(calls.create).padStart(
        9,
        "0",
      )}`;
      const response = { ...request, publicId };
      storedDesigns.set(publicId, response);
      return response;
    },
    async getDesign(publicId) {
      calls.get += 1;
      return storedDesigns.get(publicId);
    },
  };
  const patternController = new catalogue.PatternCatalogueController(
    client,
  );

  await patternController.loadInitial();
  const patternSnapshot = patternController.getSnapshot();
  assert.equal(patternSnapshot.phase, "ready");
  assert.equal(patternSnapshot.allPatterns.length, 15);

  const cases = [
    {
      basePath: "",
      configuration: {
        shape: "square",
        width: 45.25,
        height: 45.25,
        backWidth: null,
        thickness: 7.5,
        unit: "cm",
        patternId: "fern-trail",
        patternScale: 1.2,
        materialId: "cotton-canvas",
        fitPreference: "standard",
        closureType: "zipper",
        seamStyle: "plain",
      },
      expectedPath: "/configure/",
    },
    {
      basePath: "",
      configuration: {
        shape: "rectangle",
        width: 23.75,
        height: 17.25,
        backWidth: null,
        thickness: 3.5,
        unit: "in",
        patternId: "diamond-path",
        patternScale: 0.8,
        materialId: "linen-blend",
        fitPreference: "close",
        closureType: "envelope",
        seamStyle: "piped",
      },
      expectedPath: "/configure/",
    },
    {
      basePath: "/sewncovers",
      configuration: {
        shape: "box",
        width: 180.5,
        height: 60.25,
        backWidth: null,
        thickness: 12.75,
        unit: "cm",
        patternId: "terrace-wave",
        patternScale: 2,
        materialId: "polyester-weave",
        fitPreference: "relaxed",
        closureType: "slip-on",
        seamStyle: "plain",
      },
      expectedPath: "/sewncovers/configure/",
    },
  ];

  for (const journey of cases) {
    const saveController = new designSave.DesignSaveController(
      client,
      (publicId) =>
        designSave.buildDesignShareUrl(
          publicId,
          "https://example.test",
          journey.basePath,
        ),
    );
    const firstSubmission = saveController.submit(
      journey.configuration,
    );
    const duplicateSubmission = saveController.submit(
      journey.configuration,
    );

    assert.equal(firstSubmission, duplicateSubmission);
    await firstSubmission;

    const saveSnapshot = saveController.getSnapshot();
    assert.equal(saveSnapshot.phase, "success");
    const shareUrl = new URL(saveSnapshot.shareUrl);
    assert.equal(shareUrl.pathname, journey.expectedPath);
    assert.equal(
      shareUrl.searchParams.get("design"),
      saveSnapshot.publicId,
    );

    let revision = 0;
    const restored = [];
    const restoreController = new sharedDesign.SharedDesignController(
      client,
      (configuration) => {
        restored.push(configuration);
        revision += 1;
      },
      () => revision,
    );

    restoreController.start(shareUrl.search, {
      patterns: patternSnapshot.allPatterns,
      status: "ready",
    });
    await settle();

    assert.equal(restoreController.getSnapshot().phase, "restored");
    assert.deepEqual(restored, [journey.configuration]);
  }

  assert.deepEqual(calls, {
    create: cases.length,
    get: cases.length,
    patterns: 1,
  });
  assert.equal(storedDesigns.size, cases.length);
});
