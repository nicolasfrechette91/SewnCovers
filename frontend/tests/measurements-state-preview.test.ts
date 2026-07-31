import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CENTIMETRES_PER_INCH,
  convertMeasurement,
  getMeasurementRange,
  hasValidMeasurementsForShape,
  parseMeasurementDraft,
} from "../context/configuration/measurements";
import {
  configurationReducer,
  initialConfigurationState,
} from "../context/configuration/reducer";
import type {
  ConfigurationAction,
  ConfigurationState,
  CushionShape,
} from "../context/configuration/types";
import {
  calculatePreviewGeometry,
  PREVIEW_VIEWBOX_HEIGHT,
  PREVIEW_VIEWBOX_WIDTH,
} from "../components/configurator/preview-calculations";

test("validates shape-specific measurements, inclusive boundaries, and decimals", () => {
  for (const field of ["width", "height", "thickness"] as const) {
    const range = getMeasurementRange(field, "cm");

    assert.deepEqual(parseMeasurementDraft(String(range.min), field, "cm"), {
      issue: null,
      value: range.min,
    });
    assert.deepEqual(parseMeasurementDraft(String(range.max), field, "cm"), {
      issue: null,
      value: range.max,
    });
    assert.equal(
      parseMeasurementDraft(String(range.min - 0.01), field, "cm").issue,
      "belowMinimum",
    );
    assert.equal(
      parseMeasurementDraft(String(range.max + 0.01), field, "cm").issue,
      "aboveMaximum",
    );
  }

  assert.deepEqual(parseMeasurementDraft("45,25", "width", "cm"), {
    issue: null,
    value: 45.25,
  });
  assert.equal(
    hasValidMeasurementsForShape("square", 45.25, 45.25, 5, "cm"),
    true,
  );
  assert.equal(
    hasValidMeasurementsForShape("square", 45.25, 45.24, 5, "cm"),
    false,
  );
  assert.equal(
    hasValidMeasurementsForShape("rectangle", 45.25, 45.24, 5, "cm"),
    true,
  );
  assert.equal(
    hasValidMeasurementsForShape("box", 180, 60, 12.5, "cm"),
    true,
  );
});

test("rejects required, incomplete, malformed, non-positive, and over-precision drafts", () => {
  const cases = [
    ["", "required"],
    ["45.", "incomplete"],
    [".", "incomplete"],
    ["forty five", "invalid"],
    ["1e2", "invalid"],
    ["NaN", "invalid"],
    ["-1", "invalid"],
    ["0", "notPositive"],
    ["45.125", "precision"],
    ["45,125", "precision"],
  ] as const;

  for (const [draft, issue] of cases) {
    assert.equal(parseMeasurementDraft(draft, "width", "cm").issue, issue);
  }
});

test("converts metric and imperial values accurately with stable display round trips", () => {
  assert.equal(CENTIMETRES_PER_INCH, 2.54);
  assert.equal(convertMeasurement(1, "in", "cm"), 2.54);
  assert.equal(convertMeasurement(2.54, "cm", "in"), 1);
  assert.equal(convertMeasurement(45.25, "cm", "in"), 17.81);
  assert.equal(convertMeasurement(17.81, "in", "cm"), 45.24);
  assert.equal(convertMeasurement(null, "cm", "in"), null);

  const exactDisplayValues = [2.54, 25.4, 76.2, 152.4];
  for (const centimetres of exactDisplayValues) {
    const inches = convertMeasurement(centimetres, "cm", "in");
    assert.equal(convertMeasurement(inches, "in", "cm"), centimetres);
  }

  assert.deepEqual(getMeasurementRange("width", "in"), {
    min: 3.94,
    max: 118.11,
  });
});

test("initializes, updates, resets, and preserves reducer invariants", () => {
  assert.deepEqual(initialConfigurationState, {
    shape: null,
    width: null,
    height: null,
    thickness: null,
    unit: "cm",
    patternId: null,
    patternScale: 1,
  });

  const actions: readonly ConfigurationAction[] = [
    { type: "setShape", shape: "square" },
    { type: "setSquareWidth", width: 50 },
    { type: "setHeight", height: 40 },
    { type: "setThickness", thickness: 8 },
    { type: "setPatternId", patternId: "fern-trail" },
    { type: "setPatternScale", patternScale: 1.2 },
  ];
  const configured = actions.reduce(
    configurationReducer,
    initialConfigurationState,
  );

  assert.deepEqual(configured, {
    shape: "square",
    width: 50,
    height: 50,
    thickness: 8,
    unit: "cm",
    patternId: "fern-trail",
    patternScale: 1.2,
  });
  assert.equal(
    configurationReducer(configured, {
      type: "setWidth",
      width: Number.NaN,
    }),
    configured,
  );
  assert.equal(
    configurationReducer(configured, {
      type: "setPatternScale",
      patternScale: 2.1,
    }),
    configured,
  );

  const imperial = configurationReducer(configured, {
    type: "setMeasurementUnit",
    unit: "in",
  });
  assert.deepEqual(imperial, {
    ...configured,
    width: 19.69,
    height: 19.69,
    thickness: 3.15,
    unit: "in",
  });
  assert.equal(
    configurationReducer(imperial, {
      type: "setMeasurementUnit",
      unit: "in",
    }),
    imperial,
  );
  assert.equal(
    configurationReducer(configured, {
      type: "resetConfiguration",
    }),
    initialConfigurationState,
  );
});

test("accepts only complete invariant-preserving restored configurations", () => {
  const restored: ConfigurationState = {
    shape: "box",
    width: 180.5,
    height: 60.25,
    thickness: 12.75,
    unit: "cm",
    patternId: "terrace-wave",
    patternScale: 1.4,
  };
  assert.deepEqual(
    configurationReducer(initialConfigurationState, {
      type: "restoreConfiguration",
      configuration: restored,
    }),
    restored,
  );

  const invalidStates: readonly ConfigurationState[] = [
    { ...restored, patternId: "Terrace Wave" },
    { ...restored, width: 180.555 },
    { ...restored, patternScale: 1.45 },
    { ...restored, shape: "square", width: 50, height: 49 },
  ];
  for (const configuration of invalidStates) {
    assert.equal(
      configurationReducer(initialConfigurationState, {
        type: "restoreConfiguration",
        configuration,
      }),
      initialConfigurationState,
    );
  }
});

test("calculates bounded proportional preview geometry for every shape and unit", () => {
  const cases: readonly {
    shape: CushionShape;
    width: number;
    height: number;
    thickness: number;
  }[] = [
    { shape: "square", width: 50, height: 50, thickness: 8 },
    { shape: "rectangle", width: 80, height: 40, thickness: 10 },
    { shape: "box", width: 180, height: 60, thickness: 12 },
  ];

  for (const input of cases) {
    const geometry = calculatePreviewGeometry({ ...input, unit: "cm" });
    assert.ok(geometry);
    assert.ok(geometry.faceX >= 0);
    assert.ok(geometry.faceY >= 0);
    assert.ok(
      geometry.faceX + geometry.faceWidth + geometry.offsetX <=
        PREVIEW_VIEWBOX_WIDTH,
    );
    assert.ok(
      geometry.faceY + geometry.faceHeight + geometry.offsetY <=
        PREVIEW_VIEWBOX_HEIGHT,
    );
    assert.ok(
      Math.abs(
        geometry.faceWidth / geometry.faceHeight -
          input.width / input.height,
      ) < 0.001,
    );

    const imperialGeometry = calculatePreviewGeometry({
      shape: input.shape,
      width: input.width / CENTIMETRES_PER_INCH,
      height: input.height / CENTIMETRES_PER_INCH,
      thickness: input.thickness / CENTIMETRES_PER_INCH,
      unit: "in",
    });
    assert.deepEqual(imperialGeometry, geometry);
  }

  assert.equal(
    calculatePreviewGeometry({
      shape: "square",
      width: 50,
      height: 49,
      thickness: 8,
      unit: "cm",
    }),
    null,
  );
  assert.equal(
    calculatePreviewGeometry({
      shape: "rectangle",
      width: 301,
      height: 40,
      thickness: 8,
      unit: "cm",
    }),
    null,
  );
});
