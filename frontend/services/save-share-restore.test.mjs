import assert from "node:assert/strict";
import { test } from "node:test";

import { importFreshTogether } from "../tests/fresh-import.mjs";

// The three modules share one private copy of their common dependencies.
async function loadPhaseSixModules() {
  const [catalogue, designSave, sharedDesign] = await importFreshTogether(
    ["./pattern-catalogue.ts", "./design-save.ts", "./shared-design.ts"],
    import.meta.url,
  );

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
        solidColor: null,
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
        solidColor: null,
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
        solidColor: null,
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
    const expectedRestored = { ...journey.configuration };
    delete expectedRestored.patternId;
    delete expectedRestored.solidColor;
    expectedRestored.pattern = {
      kind: "built-in",
      patternId: journey.configuration.patternId,
    };
    assert.deepEqual(restored, [expectedRestored]);
  }

  assert.deepEqual(calls, {
    create: cases.length,
    get: cases.length,
    patterns: 1,
  });
  assert.equal(storedDesigns.size, cases.length);
});
