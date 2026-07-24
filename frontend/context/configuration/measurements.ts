import type {
  CushionShape,
  MeasurementUnit,
} from "./types";

export const CENTIMETRES_PER_INCH = 2.54;
export const MEASUREMENT_DECIMAL_PLACES = 2;

export type MeasurementField = "height" | "thickness" | "width";

export type MeasurementDraftIssue =
  | "aboveMaximum"
  | "belowMinimum"
  | "incomplete"
  | "invalid"
  | "notPositive"
  | "precision"
  | "required";

interface MeasurementRange {
  readonly max: number;
  readonly min: number;
}

export interface MeasurementDraftResult {
  readonly issue: MeasurementDraftIssue | null;
  readonly value: number | null;
}

export const MEASUREMENT_RANGES_CM: Readonly<
  Record<MeasurementField, MeasurementRange>
> = {
  height: { min: 10, max: 300 },
  thickness: { min: 1, max: 60 },
  width: { min: 10, max: 300 },
};

const displayPrecisionFactor = 10 ** MEASUREMENT_DECIMAL_PLACES;
const completeDecimalPattern =
  /^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;
const trailingDecimalPattern = /^(?:\d+[.,]|[.,])$/;

export function isFinitePositiveMeasurement(
  value: number | null,
): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

export function isNullableCommittedMeasurement(
  value: number | null,
): boolean {
  return value === null || isFinitePositiveMeasurement(value);
}

export function roundMeasurement(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Measurements must be finite before rounding.");
  }

  return Math.round((value + Number.EPSILON) * displayPrecisionFactor) /
    displayPrecisionFactor;
}

export function formatMeasurement(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "";
  }

  return roundMeasurement(value)
    .toFixed(MEASUREMENT_DECIMAL_PLACES)
    .replace(/\.?0+$/, "");
}

export function convertMeasurement(
  value: number | null,
  fromUnit: MeasurementUnit,
  toUnit: MeasurementUnit,
): number | null {
  if (value === null || fromUnit === toUnit) {
    return value;
  }

  if (!Number.isFinite(value)) {
    throw new RangeError("Measurements must be finite before conversion.");
  }

  const converted =
    fromUnit === "in"
      ? value * CENTIMETRES_PER_INCH
      : value / CENTIMETRES_PER_INCH;

  return roundMeasurement(converted);
}

export function toCentimetres(
  value: number,
  unit: MeasurementUnit,
): number {
  return unit === "cm" ? value : value * CENTIMETRES_PER_INCH;
}

export function isMeasurementWithinRange(
  value: number | null,
  field: MeasurementField,
  unit: MeasurementUnit,
): value is number {
  if (!isFinitePositiveMeasurement(value)) {
    return false;
  }

  const valueInCentimetres = toCentimetres(value, unit);
  const range = MEASUREMENT_RANGES_CM[field];

  return (
    valueInCentimetres >= range.min &&
    valueInCentimetres <= range.max
  );
}

export function hasValidMeasurementsForShape(
  shape: CushionShape | null,
  width: number | null,
  height: number | null,
  thickness: number | null,
  unit: MeasurementUnit,
): boolean {
  if (shape === null) {
    return false;
  }

  const faceMeasurementsAreValid =
    isMeasurementWithinRange(width, "width", unit) &&
    isMeasurementWithinRange(height, "height", unit);

  if (
    !faceMeasurementsAreValid ||
    !isMeasurementWithinRange(thickness, "thickness", unit)
  ) {
    return false;
  }

  return shape !== "square" || width === height;
}

export function getMeasurementRange(
  field: MeasurementField,
  unit: MeasurementUnit,
): MeasurementRange {
  const range = MEASUREMENT_RANGES_CM[field];

  if (unit === "cm") {
    return range;
  }

  return {
    min:
      Math.ceil(
        (range.min / CENTIMETRES_PER_INCH) * displayPrecisionFactor,
      ) / displayPrecisionFactor,
    max:
      Math.floor(
        (range.max / CENTIMETRES_PER_INCH) * displayPrecisionFactor,
      ) / displayPrecisionFactor,
  };
}

export function parseMeasurementDraft(
  draft: string,
  field: MeasurementField,
  unit: MeasurementUnit,
): MeasurementDraftResult {
  const trimmedDraft = draft.trim();

  if (trimmedDraft === "") {
    return { issue: "required", value: null };
  }

  if (trailingDecimalPattern.test(trimmedDraft)) {
    return { issue: "incomplete", value: null };
  }

  if (!completeDecimalPattern.test(trimmedDraft)) {
    return { issue: "invalid", value: null };
  }

  const fractionalPart = trimmedDraft.split(/[.,]/, 2)[1];

  if (
    fractionalPart !== undefined &&
    fractionalPart.length > MEASUREMENT_DECIMAL_PLACES
  ) {
    return { issue: "precision", value: null };
  }

  const value = Number(trimmedDraft.replace(",", "."));

  if (!Number.isFinite(value)) {
    return { issue: "invalid", value: null };
  }

  if (value <= 0) {
    return { issue: "notPositive", value: null };
  }

  const range = MEASUREMENT_RANGES_CM[field];

  if (toCentimetres(value, unit) < range.min) {
    return { issue: "belowMinimum", value: null };
  }

  if (!isMeasurementWithinRange(value, field, unit)) {
    return { issue: "aboveMaximum", value: null };
  }

  return { issue: null, value: roundMeasurement(value) };
}
