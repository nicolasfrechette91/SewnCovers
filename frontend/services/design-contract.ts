import {
  CLOSURE_TYPES,
  CUSHION_SHAPES,
  FIT_PREFERENCES,
  MATERIAL_IDS,
  MEASUREMENT_UNITS,
  SEAM_STYLES,
  type ClosureType,
  type CushionShape,
  type FitPreference,
  type MaterialId,
  type MeasurementUnit,
  type SeamStyle,
} from "../context/configuration/types";
import {
  DEFAULT_CLOSURE_TYPE,
  DEFAULT_FIT_PREFERENCE,
  DEFAULT_MATERIAL_ID,
  DEFAULT_SEAM_STYLE,
} from "../data/cover-options";
import {
  hasAtMostDecimalPlaces,
  isFiniteNumber,
  isOneOf,
  isRecord,
} from "./validation";

// The public design record (POST /designs and GET /designs/{id}), read once
// for the API client, the share-link restore and the save check.

export const PUBLIC_DESIGN_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const PATTERN_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SOLID_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

export interface CreateDesignRequest {
  readonly height: number;
  readonly backWidth: number | null;
  readonly patternId: string | null;
  readonly solidColor: string | null;
  readonly patternScale: number;
  readonly materialId: MaterialId;
  readonly fitPreference: FitPreference;
  readonly closureType: ClosureType;
  readonly seamStyle: SeamStyle;
  readonly shape: CushionShape;
  readonly thickness: number;
  readonly unit: MeasurementUnit;
  readonly width: number;
}

export interface DesignResponse extends CreateDesignRequest {
  readonly publicId: string;
}

const COVER_FIELDS = [
  "backWidth",
  "materialId",
  "fitPreference",
  "closureType",
  "seamStyle",
] as const;

function isMeasurement(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0 && hasAtMostDecimalPlaces(value, 2);
}

/**
 * A saved design, or undefined when it is not one. Records from before the
 * cover choices carry none of their fields and get the defaults (no back
 * width, Cotton canvas, Standard fit, Zipper, Plain seam); later records carry
 * all of them. A design is a pattern (`patternId`) or a solid colour
 * (`solidColor`), never both; the other is absent or null. Fields this build
 * does not know are dropped.
 */
export function readDesignResponse(value: unknown): DesignResponse | undefined {
  if (!isRecord(value)) return undefined;
  const coverFields = COVER_FIELDS.filter((field) =>
    Object.hasOwn(value, field),
  );
  if (coverFields.length !== 0 && coverFields.length !== COVER_FIELDS.length) {
    return undefined;
  }
  const legacy = coverFields.length === 0;
  const patternId = value.patternId ?? null;
  const solidColor = value.solidColor ?? null;
  if (
    !isOneOf(CUSHION_SHAPES, value.shape) ||
    !isMeasurement(value.width) ||
    !isMeasurement(value.height) ||
    !isMeasurement(value.thickness) ||
    !isOneOf(MEASUREMENT_UNITS, value.unit) ||
    (patternId === null) === (solidColor === null) ||
    (patternId !== null &&
      !(typeof patternId === "string" && PATTERN_ID_PATTERN.test(patternId))) ||
    (solidColor !== null &&
      (legacy ||
        !(
          typeof solidColor === "string" && SOLID_COLOR_PATTERN.test(solidColor)
        ))) ||
    !isFiniteNumber(value.patternScale) ||
    value.patternScale < 0.5 ||
    value.patternScale > 2 ||
    !hasAtMostDecimalPlaces(value.patternScale, 1) ||
    typeof value.publicId !== "string" ||
    !PUBLIC_DESIGN_ID_PATTERN.test(value.publicId)
  ) {
    return undefined;
  }
  const common = {
    shape: value.shape,
    width: value.width,
    height: value.height,
    thickness: value.thickness,
    unit: value.unit,
    patternId: patternId as string | null,
    solidColor: solidColor as string | null,
    patternScale: value.patternScale,
    publicId: value.publicId,
  };
  if (legacy) {
    return {
      ...common,
      backWidth: null,
      materialId: DEFAULT_MATERIAL_ID,
      fitPreference: DEFAULT_FIT_PREFERENCE,
      closureType: DEFAULT_CLOSURE_TYPE,
      seamStyle: DEFAULT_SEAM_STYLE,
    };
  }
  if (
    !(value.backWidth === null || isMeasurement(value.backWidth)) ||
    !isOneOf(MATERIAL_IDS, value.materialId) ||
    !isOneOf(FIT_PREFERENCES, value.fitPreference) ||
    !isOneOf(CLOSURE_TYPES, value.closureType) ||
    !isOneOf(SEAM_STYLES, value.seamStyle)
  ) {
    return undefined;
  }
  return {
    ...common,
    backWidth: value.backWidth,
    materialId: value.materialId,
    fitPreference: value.fitPreference,
    closureType: value.closureType,
    seamStyle: value.seamStyle,
  };
}
