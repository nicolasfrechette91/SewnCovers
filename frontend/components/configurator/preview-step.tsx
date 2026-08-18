"use client";

import {
  useId,
  type CSSProperties,
  type ChangeEvent,
} from "react";

import {
  formatMeasurement,
  formatPatternScale,
  hasValidMeasurementsForShape,
  isMeasurementWithinRange,
  isPatternScaleWithinRange,
  PATTERN_SCALE_MAX,
  PATTERN_SCALE_MIN,
  PATTERN_SCALE_STEP,
  useConfiguration,
  type CushionShape,
  type FitPreference,
  type SeamStyle,
} from "@/context/configuration";
import {
  closureOptions,
  findCoverOption,
  fitOptions,
  materialOptions,
  seamOptions,
} from "@/data/cover-options";
import type { PatternDefinition } from "@/data/patterns";
import {
  getCushionShapeDefinition,
} from "@/data/shapes";

import { CushionPreview } from "./cushion-preview";
import {
  calculatePreviewGeometry,
  PREVIEW_VIEWBOX_HEIGHT,
  PREVIEW_VIEWBOX_WIDTH,
  type PreviewGeometry,
} from "./preview-calculations";

type PatternStyle = CSSProperties & {
  "--pattern-scale": number;
};

interface PreviewDetail {
  readonly label: string;
  readonly value: string;
}

function pointsToString(
  points: readonly (readonly [number, number])[],
): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

function PreviewVisual({
  geometry,
  fitPreference,
  patternClassName,
  patternScale,
  shape,
  seamStyle,
}: Readonly<{
  fitPreference: FitPreference;
  geometry: PreviewGeometry;
  patternClassName: string;
  patternScale: number;
  shape: CushionShape;
  seamStyle: SeamStyle;
}>) {
  const {
    backFaceWidth,
    faceHeight,
    faceWidth,
    faceX,
    faceY,
    offsetX,
    offsetY,
  } = geometry;
  const faceRight = faceX + faceWidth;
  const faceBottom = faceY + faceHeight;
  const sidePoints = pointsToString([
    [faceRight, faceY],
    [faceRight + offsetX, faceY + offsetY],
    [faceRight + offsetX, faceBottom + offsetY],
    [faceRight, faceBottom],
  ]);
  const bottomPoints = pointsToString([
    [faceX, faceBottom],
    [faceRight, faceBottom],
    [faceRight + offsetX, faceBottom + offsetY],
    [faceX + offsetX, faceBottom + offsetY],
  ]);
  const patternStyle: PatternStyle = {
    "--pattern-scale": patternScale,
  };
  const taperedInset =
    backFaceWidth === null ? 0 : (faceWidth - backFaceWidth) / 2;
  const faceClipPath =
    shape === "round"
      ? "circle(50%)"
      : shape === "tapered"
        ? `polygon(${taperedInset}px 0, ${faceWidth - taperedInset}px 0, 100% 100%, 0 100%)`
        : undefined;
  const cornerRadius =
    shape === "box"
      ? 4
      : fitPreference === "close"
        ? 6
        : fitPreference === "relaxed"
          ? 18
          : 10;
  const taperedPoints = pointsToString([
    [faceX + taperedInset, faceY],
    [faceRight - taperedInset, faceY],
    [faceRight, faceBottom],
    [faceX, faceBottom],
  ]);

  return (
    <svg
      className="block size-full max-h-full max-w-full"
      viewBox={`0 0 ${PREVIEW_VIEWBOX_WIDTH} ${PREVIEW_VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      focusable="false"
      data-preview-shape={shape}
      data-preview-fit={fitPreference}
    >
      {shape === "round" ? (
        <ellipse
          className="cushion-preview-bottom"
          cx={faceX + faceWidth / 2 + offsetX}
          cy={faceY + faceHeight / 2 + offsetY}
          rx={faceWidth / 2}
          ry={faceHeight / 2}
        />
      ) : (
        <>
          <polygon className="cushion-preview-side" points={sidePoints} />
          <polygon className="cushion-preview-bottom" points={bottomPoints} />
        </>
      )}
      <foreignObject
        x={faceX}
        y={faceY}
        width={faceWidth}
        height={faceHeight}
      >
        <div
          className={`prototype-pattern ${patternClassName} cushion-preview-face size-full`}
          style={{ ...patternStyle, clipPath: faceClipPath }}
        />
      </foreignObject>
      {shape === "round" ? (
        <ellipse
          className="cushion-preview-face-outline"
          cx={faceX + faceWidth / 2}
          cy={faceY + faceHeight / 2}
          rx={faceWidth / 2}
          ry={faceHeight / 2}
          vectorEffect="non-scaling-stroke"
        />
      ) : shape === "tapered" ? (
        <polygon
          className="cushion-preview-face-outline"
          points={taperedPoints}
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <rect
          className="cushion-preview-face-outline"
          x={faceX}
          y={faceY}
          width={faceWidth}
          height={faceHeight}
          rx={cornerRadius}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {seamStyle === "piped" ? (
        shape === "round" ? (
          <ellipse className="cushion-preview-piping" cx={faceX + faceWidth / 2} cy={faceY + faceHeight / 2} rx={Math.max(0, faceWidth / 2 - 5)} ry={Math.max(0, faceHeight / 2 - 5)} />
        ) : shape === "tapered" ? (
          <polygon className="cushion-preview-piping" points={taperedPoints} />
        ) : (
          <rect className="cushion-preview-piping" x={faceX + 5} y={faceY + 5} width={Math.max(0, faceWidth - 10)} height={Math.max(0, faceHeight - 10)} rx={Math.max(0, cornerRadius - 2)} />
        )
      ) : null}
    </svg>
  );
}

function getEmptyMessage(
  shape: CushionShape,
  measurementsAreValid: boolean,
  patternIsSelected: boolean,
  patternIdIsPresent: boolean,
  patternScaleIsValid: boolean,
): string {
  if (!measurementsAreValid && !patternIsSelected) {
    return "Enter valid measurements and choose a pattern to build the preview.";
  }

  if (!measurementsAreValid) {
    const requiredMeasurements =
      shape === "square"
        ? "width and thickness"
        : shape === "round"
          ? "diameter and thickness"
          : shape === "tapered"
            ? "front width, back width, depth, and thickness"
        : shape === "rectangle"
          ? "width, height, and thickness"
          : "width, depth, and thickness";

    return `Enter a valid ${requiredMeasurements} to build the proportional preview.`;
  }

  if (!patternIsSelected) {
    return patternIdIsPresent
      ? "The selected pattern is unavailable. Choose another pattern to build the preview."
      : "Choose a pattern to apply it to the preview.";
  }

  if (!patternScaleIsValid) {
    return "Choose a valid pattern scale to build the preview.";
  }

  return "The preview is incomplete.";
}

function formatValidMeasurement(
  value: number | null,
  isValid: boolean,
  unit: string,
): string {
  return isValid
    ? `${formatMeasurement(value)} ${unit}`
    : "Invalid or incomplete";
}

export interface PreviewStepProps {
  focusTargetId?: string;
  selectedPattern: PatternDefinition | null;
  showScaleControls?: boolean;
}

export function PreviewStep({
  focusTargetId,
  selectedPattern,
  showScaleControls = true,
}: PreviewStepProps) {
  const { state, dispatch } = useConfiguration();
  const generatedId = useId();
  const scaleControlId =
    focusTargetId ?? `${generatedId}-pattern-scale`;
  const scaleDescriptionId = `${scaleControlId}-description`;
  const measurementsAreValid = hasValidMeasurementsForShape(
    state.shape,
    state.width,
    state.height,
    state.thickness,
    state.unit,
    state.backWidth,
  );
  const patternScaleIsValid = isPatternScaleWithinRange(
    state.patternScale,
  );
  const geometry = calculatePreviewGeometry({
    backWidth: state.backWidth,
    width: state.width,
    height: state.height,
    shape: state.shape,
    thickness: state.thickness,
    unit: state.unit,
  });
  const previewIsComplete =
    measurementsAreValid &&
    selectedPattern !== null &&
    patternScaleIsValid &&
    geometry !== null;
  const formattedScale =
    formatPatternScale(state.patternScale) || "Invalid";

  if (state.shape === null) {
    return null;
  }

  const shape = state.shape;
  const definition = getCushionShapeDefinition(shape);
  const measurementValues = {
    backWidth: state.backWidth,
    height: state.height,
    thickness: state.thickness,
    width: state.width,
  } as const;
  const dimensionDetails: readonly PreviewDetail[] =
    definition.measurementFields.map(({ field, label }) => ({
      label,
      value: formatValidMeasurement(
        measurementValues[field],
        isMeasurementWithinRange(
          measurementValues[field],
          field,
          state.unit,
        ),
        state.unit,
      ),
    }));

  const changePatternScale = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    dispatch({
      type: "setPatternScale",
      patternScale: Number(event.currentTarget.value),
    });
  };

  const adjustPatternScale = (adjustment: number) => {
    dispatch({
      type: "setPatternScale",
      patternScale: Number(
        (state.patternScale + adjustment).toFixed(1),
      ),
    });
  };

  return (
    <section
      aria-label={`${definition.name} cushion preview`}
      className="mt-layout scroll-mt-layout"
    >
      <CushionPreview
        title={`Preview your ${definition.name.toLowerCase()} cushion`}
        emptyMessage={getEmptyMessage(
          shape,
          measurementsAreValid,
          selectedPattern !== null,
          state.patternId !== null,
          patternScaleIsValid,
        )}
        visual={
          previewIsComplete ? (
            <PreviewVisual
              fitPreference={state.fitPreference}
              geometry={geometry}
              patternClassName={selectedPattern.previewClassName}
              patternScale={state.patternScale}
              shape={shape}
              seamStyle={state.seamStyle}
            />
          ) : undefined
        }
        description={
          <div className="min-w-0">
            <p className="text-body font-control text-text-primary">
              {previewIsComplete
                ? "Current proportional preview"
                : "Preview incomplete"}
            </p>
            <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="font-control text-text-primary">Shape</dt>
                <dd className="break-words">{definition.name}</dd>
              </div>
              <div className="min-w-0">
                <dt className="font-control text-text-primary">Material</dt>
                <dd className="break-words">
                  {findCoverOption(materialOptions, state.materialId).name}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-control text-text-primary">Fit preference</dt>
                <dd className="break-words">
                  {findCoverOption(fitOptions, state.fitPreference).name}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-control text-text-primary">Closure / access</dt>
                <dd className="break-words">
                  {findCoverOption(closureOptions, state.closureType).name}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-control text-text-primary">Edge finish</dt>
                <dd className="break-words">
                  {findCoverOption(seamOptions, state.seamStyle).name}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-control text-text-primary">
                  Pattern
                </dt>
                <dd className="break-words">
                  {selectedPattern?.name ??
                    (state.patternId === null
                      ? "Not selected"
                      : "Selected pattern unavailable")}
                </dd>
              </div>
              {dimensionDetails.map((detail) => (
                <div className="min-w-0" key={detail.label}>
                  <dt className="font-control text-text-primary">
                    {detail.label}
                  </dt>
                  <dd className="break-words">{detail.value}</dd>
                </div>
              ))}
              <div className="min-w-0">
                <dt className="font-control text-text-primary">
                  Pattern scale
                </dt>
                <dd className="break-words">{formattedScale}</dd>
              </div>
            </dl>
            <p className="mt-3 text-supporting text-text-muted">
              Fit styling is indicative only and does not alter the entered measurements. Closure details are listed but not drawn because this view does not show the opening.
            </p>

            {selectedPattern && showScaleControls ? (
              <div className="mt-component rounded-card border border-border bg-surface-subtle p-control-x py-4">
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                  <label
                    htmlFor={scaleControlId}
                    className="text-label font-control tracking-label text-text-primary"
                  >
                    Pattern size
                  </label>
                  <output
                    htmlFor={scaleControlId}
                    className="text-body font-control text-brand"
                  >
                    {formattedScale}
                  </output>
                </div>
                <input
                  id={scaleControlId}
                  className="pattern-scale-control mt-3 block min-h-11 w-full cursor-pointer accent-brand"
                  type="range"
                  min={PATTERN_SCALE_MIN}
                  max={PATTERN_SCALE_MAX}
                  step={PATTERN_SCALE_STEP}
                  value={state.patternScale}
                  aria-describedby={scaleDescriptionId}
                  aria-valuetext={`${formattedScale} pattern size`}
                  onChange={changePatternScale}
                />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    className="min-h-11 min-w-0 rounded-control border border-border-strong bg-surface px-3 py-2 text-button font-control break-words text-brand transition-[background-color,border-color,box-shadow] hover:bg-page active:bg-surface-subtle motion-reduce:transition-none disabled:cursor-not-allowed disabled:border-control-disabled-border disabled:bg-control-disabled-surface disabled:text-control-disabled-text"
                    type="button"
                    disabled={
                      state.patternScale <= PATTERN_SCALE_MIN
                    }
                    aria-describedby={scaleDescriptionId}
                    onClick={() =>
                      adjustPatternScale(-PATTERN_SCALE_STEP)
                    }
                  >
                    Smaller
                  </button>
                  <button
                    className="min-h-11 min-w-0 rounded-control border border-border-strong bg-surface px-3 py-2 text-button font-control break-words text-brand transition-[background-color,border-color,box-shadow] hover:bg-page active:bg-surface-subtle motion-reduce:transition-none disabled:cursor-not-allowed disabled:border-control-disabled-border disabled:bg-control-disabled-surface disabled:text-control-disabled-text"
                    type="button"
                    disabled={
                      state.patternScale >= PATTERN_SCALE_MAX
                    }
                    aria-describedby={scaleDescriptionId}
                    onClick={() =>
                      adjustPatternScale(PATTERN_SCALE_STEP)
                    }
                  >
                    Larger
                  </button>
                </div>
                <p
                  id={scaleDescriptionId}
                  className="mt-2 break-words text-supporting text-text-muted"
                >
                  Adjust from {PATTERN_SCALE_MIN.toFixed(1)}× to{" "}
                  {PATTERN_SCALE_MAX.toFixed(1)}× with the slider or buttons.
                  This changes only the preview motif size and is not a
                  real-world measurement.
                </p>
              </div>
            ) : null}
          </div>
        }
      />
    </section>
  );
}
