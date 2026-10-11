// Every value each choice can take. The types derive from these lists, and
// the response and draft readers check against them; the option tables in
// data/ describe the same values (tests/option-tables.test.ts keeps them in
// step). An unknown value is rejected: these drive geometry, saves and links.
export const CUSHION_SHAPES = [
  "box",
  "rectangle",
  "round",
  "square",
  "tapered",
] as const;
export type CushionShape = (typeof CUSHION_SHAPES)[number];

export const MEASUREMENT_UNITS = ["cm", "in"] as const;
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export const MATERIAL_IDS = [
  "cotton-canvas",
  "linen-blend",
  "polyester-weave",
] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];
export const FIT_PREFERENCES = ["close", "relaxed", "standard"] as const;
export type FitPreference = (typeof FIT_PREFERENCES)[number];
export const CLOSURE_TYPES = ["envelope", "slip-on", "zipper"] as const;
export type ClosureType = (typeof CLOSURE_TYPES)[number];
export const SEAM_STYLES = ["piped", "plain"] as const;
export type SeamStyle = (typeof SEAM_STYLES)[number];

export type PatternChoice =
  | {
      readonly kind: "built-in";
      readonly patternId: string;
    }
  | {
      readonly kind: "custom";
      readonly assetId: string;
      readonly derivativeId: string;
      readonly processingVersion: string;
      readonly label: string;
      readonly previewUrl: string | null;
      readonly unavailableReason?: "deleted" | "unavailable";
    }
  | {
      readonly kind: "solid";
      readonly color: string;
    };

export interface ConfigurationState {
  readonly shape: CushionShape | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly backWidth: number | null;
  readonly thickness: number | null;
  readonly unit: MeasurementUnit;
  readonly pattern: PatternChoice | null;
  readonly patternScale: number;
  readonly materialId: MaterialId;
  readonly fitPreference: FitPreference;
  readonly closureType: ClosureType;
  readonly seamStyle: SeamStyle;
}

export type ConfigurationAction =
  | {
      readonly type: "restoreConfiguration";
      readonly configuration: Readonly<ConfigurationState>;
    }
  | { readonly type: "setShape"; readonly shape: CushionShape | null }
  | { readonly type: "setWidth"; readonly width: number | null }
  | {
      readonly type: "setSquareWidth";
      readonly width: number | null;
    }
  | { readonly type: "setHeight"; readonly height: number | null }
  | {
      readonly type: "setBackWidth";
      readonly backWidth: number | null;
    }
  | {
      readonly type: "setThickness";
      readonly thickness: number | null;
    }
  | {
      readonly type: "setMeasurementUnit";
      readonly unit: MeasurementUnit;
    }
  | {
      readonly type: "setBuiltInPattern";
      readonly patternId: string | null;
    }
  | {
      readonly type: "setCustomPattern";
      readonly pattern: Extract<PatternChoice, { readonly kind: "custom" }>;
    }
  | { readonly type: "setSolidColor"; readonly color: string }
  | { readonly type: "setPatternScale"; readonly patternScale: number }
  | { readonly type: "setMaterialId"; readonly materialId: MaterialId }
  | {
      readonly type: "setFitPreference";
      readonly fitPreference: FitPreference;
    }
  | {
      readonly type: "setClosureType";
      readonly closureType: ClosureType;
    }
  | { readonly type: "setSeamStyle"; readonly seamStyle: SeamStyle }
  | {
      /** A browser draft, already validated field by field. */
      readonly type: "restoreDraft";
      readonly configuration: Readonly<ConfigurationState>;
    }
  | { readonly type: "clearCustomPattern" }
  | { readonly type: "resetConfiguration" };

export function getBuiltInPatternId(
  pattern: PatternChoice | null,
): string | null {
  return pattern?.kind === "built-in" ? pattern.patternId : null;
}

export function getSolidColor(pattern: PatternChoice | null): string | null {
  return pattern?.kind === "solid" ? pattern.color : null;
}
