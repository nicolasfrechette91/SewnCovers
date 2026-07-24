import {
  isMeasurementWithinRange,
  toCentimetres,
} from "../../context/configuration/measurements";
import type { MeasurementUnit } from "../../context/configuration/types";

export const PREVIEW_VIEWBOX_WIDTH = 360;
export const PREVIEW_VIEWBOX_HEIGHT = 280;

const PREVIEW_HORIZONTAL_PADDING = 32;
const PREVIEW_VERTICAL_PADDING = 28;
const THICKNESS_HORIZONTAL_PROJECTION = 0.55;
const THICKNESS_VERTICAL_PROJECTION = 0.35;
const GEOMETRY_DECIMAL_PLACES = 3;

export interface PreviewGeometryInput {
  readonly height: number | null;
  readonly thickness: number | null;
  readonly unit: MeasurementUnit;
  readonly width: number | null;
}

export interface PreviewGeometry {
  readonly faceHeight: number;
  readonly faceWidth: number;
  readonly faceX: number;
  readonly faceY: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

function roundGeometry(value: number): number {
  return Number(value.toFixed(GEOMETRY_DECIMAL_PLACES));
}

export function calculatePreviewGeometry({
  height,
  thickness,
  unit,
  width,
}: PreviewGeometryInput): PreviewGeometry | null {
  if (
    !isMeasurementWithinRange(width, "width", unit) ||
    !isMeasurementWithinRange(height, "width", unit) ||
    !isMeasurementWithinRange(thickness, "thickness", unit)
  ) {
    return null;
  }

  const widthInCentimetres = toCentimetres(width, unit);
  const heightInCentimetres = toCentimetres(height, unit);
  const thicknessInCentimetres = toCentimetres(thickness, unit);
  const projectedThicknessX =
    thicknessInCentimetres * THICKNESS_HORIZONTAL_PROJECTION;
  const projectedThicknessY =
    thicknessInCentimetres * THICKNESS_VERTICAL_PROJECTION;
  const unscaledWidth = widthInCentimetres + projectedThicknessX;
  const unscaledHeight = heightInCentimetres + projectedThicknessY;
  const availableWidth =
    PREVIEW_VIEWBOX_WIDTH - PREVIEW_HORIZONTAL_PADDING * 2;
  const availableHeight =
    PREVIEW_VIEWBOX_HEIGHT - PREVIEW_VERTICAL_PADDING * 2;
  const scale = Math.min(
    availableWidth / unscaledWidth,
    availableHeight / unscaledHeight,
  );

  if (!Number.isFinite(scale) || scale <= 0) {
    return null;
  }

  const faceWidth = widthInCentimetres * scale;
  const faceHeight = heightInCentimetres * scale;
  const offsetX = projectedThicknessX * scale;
  const offsetY = projectedThicknessY * scale;
  const totalWidth = faceWidth + offsetX;
  const totalHeight = faceHeight + offsetY;
  const faceX = (PREVIEW_VIEWBOX_WIDTH - totalWidth) / 2;
  const faceY = (PREVIEW_VIEWBOX_HEIGHT - totalHeight) / 2;
  const values = [
    faceHeight,
    faceWidth,
    faceX,
    faceY,
    offsetX,
    offsetY,
  ];

  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    return null;
  }

  return {
    faceHeight: roundGeometry(faceHeight),
    faceWidth: roundGeometry(faceWidth),
    faceX: roundGeometry(faceX),
    faceY: roundGeometry(faceY),
    offsetX: roundGeometry(offsetX),
    offsetY: roundGeometry(offsetY),
  };
}
