import {
  isMeasurementWithinRange,
  toCentimetres,
} from "../../context/configuration/measurements";
import type {
  CushionShape,
  MeasurementUnit,
} from "../../context/configuration/types";

export const PREVIEW_VIEWBOX_WIDTH = 360;
export const PREVIEW_VIEWBOX_HEIGHT = 280;

const PREVIEW_HORIZONTAL_PADDING = 32;
const PREVIEW_VERTICAL_PADDING = 28;
const THICKNESS_HORIZONTAL_PROJECTION = 0.55;
const THICKNESS_VERTICAL_PROJECTION = 0.35;
const BOX_THICKNESS_HORIZONTAL_PROJECTION = 0.32;
const BOX_THICKNESS_VERTICAL_PROJECTION = 0.6;
const GEOMETRY_DECIMAL_PLACES = 3;

export interface PreviewGeometryInput {
  readonly backWidth?: number | null;
  readonly height: number | null;
  readonly shape: CushionShape | null;
  readonly thickness: number | null;
  readonly unit: MeasurementUnit;
  readonly width: number | null;
}

export interface PreviewGeometry {
  readonly backFaceWidth: number | null;
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
  backWidth = null,
  height,
  shape,
  thickness,
  unit,
  width,
}: PreviewGeometryInput): PreviewGeometry | null {
  if (
    shape === null ||
    !isMeasurementWithinRange(width, "width", unit) ||
    !isMeasurementWithinRange(height, "height", unit) ||
    !isMeasurementWithinRange(thickness, "thickness", unit) ||
    ((shape === "square" || shape === "round") && width !== height) ||
    (shape === "tapered" &&
      (!isMeasurementWithinRange(backWidth, "backWidth", unit) ||
        backWidth >= width))
  ) {
    return null;
  }

  const widthInCentimetres = toCentimetres(width, unit);
  const heightInCentimetres = toCentimetres(height, unit);
  const thicknessInCentimetres = toCentimetres(thickness, unit);
  const backWidthInCentimetres =
    shape === "tapered" && backWidth !== null
      ? toCentimetres(backWidth, unit)
      : null;
  const horizontalProjection =
    shape === "box"
      ? BOX_THICKNESS_HORIZONTAL_PROJECTION
      : THICKNESS_HORIZONTAL_PROJECTION;
  const verticalProjection =
    shape === "box"
      ? BOX_THICKNESS_VERTICAL_PROJECTION
      : THICKNESS_VERTICAL_PROJECTION;
  const projectedThicknessX =
    thicknessInCentimetres * horizontalProjection;
  const projectedThicknessY =
    thicknessInCentimetres * verticalProjection;
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
    backFaceWidth:
      backWidthInCentimetres === null
        ? null
        : roundGeometry(backWidthInCentimetres * scale),
    faceHeight: roundGeometry(faceHeight),
    faceWidth: roundGeometry(faceWidth),
    faceX: roundGeometry(faceX),
    faceY: roundGeometry(faceY),
    offsetX: roundGeometry(offsetX),
    offsetY: roundGeometry(offsetY),
  };
}
