import {
  closureOptions,
  DEFAULT_CLOSURE_TYPE,
  DEFAULT_FIT_PREFERENCE,
  DEFAULT_MATERIAL_ID,
  DEFAULT_SEAM_STYLE,
  fitOptions,
  materialOptions,
  seamOptions,
} from "../../data/cover-options";
import { isNormalizedHexColor } from "./fabric-color";
import { isFinitePositiveMeasurement, roundMeasurement } from "./measurements";
import { normalizePatternScale, PATTERN_SCALE_DEFAULT } from "./pattern-scale";
import { initialConfigurationState } from "./reducer";
import type {
  ConfigurationState,
  CushionShape,
  PatternChoice,
} from "./types";

// Browser drafts are validated field by field, so a half-finished or partly
// damaged draft still brings back everything that is valid. Only the
// configurator's draft session loads this.

const cushionShapes: readonly CushionShape[] = [
  "box",
  "rectangle",
  "round",
  "square",
  "tapered",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function draftMeasurement(value: unknown): number | null {
  return typeof value === "number" &&
    isFinitePositiveMeasurement(value) &&
    roundMeasurement(value) === value
    ? value
    : null;
}

function draftOption<Id extends string>(
  options: readonly { readonly id: Id }[],
  value: unknown,
  fallback: Id,
): Id {
  return options.find(({ id }) => id === value)?.id ?? fallback;
}

function draftPattern(value: unknown): PatternChoice | null {
  if (!isRecord(value)) return null;
  if (
    value.kind === "built-in" &&
    typeof value.patternId === "string" &&
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value.patternId)
  ) {
    return { kind: "built-in", patternId: value.patternId };
  }
  if (value.kind === "solid" && isNormalizedHexColor(value.color)) {
    return { kind: "solid", color: value.color };
  }
  if (
    value.kind === "custom" &&
    typeof value.assetId === "string" &&
    /^[A-Za-z0-9_-]{22}$/.test(value.assetId) &&
    typeof value.derivativeId === "string" &&
    /^[A-Za-z0-9_-]{22}$/.test(value.derivativeId) &&
    typeof value.processingVersion === "string" &&
    value.processingVersion.length > 0 &&
    value.processingVersion.length <= 80
  ) {
    const label =
      typeof value.label === "string" ? value.label.trim().slice(0, 120) : "";
    // Preview URLs are short-lived grants, so they are never restored.
    return {
      kind: "custom",
      assetId: value.assetId,
      derivativeId: value.derivativeId,
      processingVersion: value.processingVersion,
      label: label || "Custom pattern",
      previewUrl: null,
    };
  }
  return null;
}

/**
 * Rebuilds configurator state from a browser draft, keeping every valid field
 * and falling back to the initial value for anything missing or malformed.
 */
export function sanitizeDraftConfiguration(value: unknown): ConfigurationState {
  if (!isRecord(value)) return initialConfigurationState;
  const shape = cushionShapes.find((item) => item === value.shape) ?? null;
  const width = draftMeasurement(value.width);
  const patternScale =
    typeof value.patternScale === "number"
      ? normalizePatternScale(value.patternScale)
      : null;

  return {
    shape,
    width,
    height:
      shape === "square" || shape === "round"
        ? width
        : draftMeasurement(value.height),
    backWidth: draftMeasurement(value.backWidth),
    thickness: draftMeasurement(value.thickness),
    unit: value.unit === "in" ? "in" : "cm",
    pattern: draftPattern(value.pattern),
    patternScale:
      patternScale !== null && patternScale === value.patternScale
        ? patternScale
        : PATTERN_SCALE_DEFAULT,
    materialId: draftOption(materialOptions, value.materialId, DEFAULT_MATERIAL_ID),
    fitPreference: draftOption(fitOptions, value.fitPreference, DEFAULT_FIT_PREFERENCE),
    closureType: draftOption(closureOptions, value.closureType, DEFAULT_CLOSURE_TYPE),
    seamStyle: draftOption(seamOptions, value.seamStyle, DEFAULT_SEAM_STYLE),
  };
}

