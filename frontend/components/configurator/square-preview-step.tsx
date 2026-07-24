"use client";

import {
  useId,
  type CSSProperties,
  type ChangeEvent,
} from "react";

import {
  formatMeasurement,
  formatPatternScale,
  isMeasurementWithinRange,
  isPatternScaleWithinRange,
  PATTERN_SCALE_MAX,
  PATTERN_SCALE_MIN,
  PATTERN_SCALE_STEP,
  useConfiguration,
} from "@/context/configuration";
import { getPrototypePatternById } from "@/data/patterns";

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

function pointsToString(
  points: readonly (readonly [number, number])[],
): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

function PreviewVisual({
  geometry,
  patternClassName,
  patternScale,
}: Readonly<{
  geometry: PreviewGeometry;
  patternClassName: string;
  patternScale: number;
}>) {
  const {
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

  return (
    <svg
      className="block size-full max-h-full max-w-full"
      viewBox={`0 0 ${PREVIEW_VIEWBOX_WIDTH} ${PREVIEW_VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      focusable="false"
    >
      <polygon
        className="cushion-preview-side"
        points={sidePoints}
      />
      <polygon
        className="cushion-preview-bottom"
        points={bottomPoints}
      />
      <foreignObject
        x={faceX}
        y={faceY}
        width={faceWidth}
        height={faceHeight}
      >
        <div
          className={`prototype-pattern ${patternClassName} cushion-preview-face size-full`}
          style={patternStyle}
        />
      </foreignObject>
      <rect
        className="cushion-preview-face-outline"
        x={faceX}
        y={faceY}
        width={faceWidth}
        height={faceHeight}
        rx="10"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function getEmptyMessage(
  measurementsAreValid: boolean,
  patternIsSelected: boolean,
  patternScaleIsValid: boolean,
): string {
  if (!measurementsAreValid && !patternIsSelected) {
    return "Enter valid measurements and choose a pattern to build the preview.";
  }

  if (!measurementsAreValid) {
    return "Enter a valid width and thickness to build the proportional preview.";
  }

  if (!patternIsSelected) {
    return "Choose a prototype pattern to apply it to the preview.";
  }

  if (!patternScaleIsValid) {
    return "Choose a valid pattern scale to build the preview.";
  }

  return "The preview is incomplete.";
}

export function SquarePreviewStep() {
  const { state, dispatch } = useConfiguration();
  const generatedId = useId();
  const scaleControlId = `${generatedId}-pattern-scale`;
  const scaleDescriptionId = `${scaleControlId}-description`;
  const selectedPattern = getPrototypePatternById(state.patternId);
  const widthIsValid = isMeasurementWithinRange(
    state.width,
    "width",
    state.unit,
  );
  const heightIsValid = isMeasurementWithinRange(
    state.height,
    "width",
    state.unit,
  );
  const thicknessIsValid = isMeasurementWithinRange(
    state.thickness,
    "thickness",
    state.unit,
  );
  const measurementsAreValid =
    widthIsValid && heightIsValid && thicknessIsValid;
  const patternScaleIsValid = isPatternScaleWithinRange(
    state.patternScale,
  );
  const geometry = calculatePreviewGeometry({
    width: state.width,
    height: state.height,
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
  const faceDimensions =
    widthIsValid && heightIsValid
      ? `${formatMeasurement(state.width)} × ${formatMeasurement(state.height)} ${state.unit}`
      : "Invalid or incomplete";
  const thickness =
    thicknessIsValid
      ? `${formatMeasurement(state.thickness)} ${state.unit}`
      : "Invalid or incomplete";

  if (state.shape !== "square") {
    return null;
  }

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
      aria-label="Square cushion preview"
      className="mt-layout scroll-mt-layout"
    >
      <CushionPreview
        title="Preview your square cushion"
        emptyMessage={getEmptyMessage(
          measurementsAreValid,
          selectedPattern !== null,
          patternScaleIsValid,
        )}
        visual={
          previewIsComplete ? (
            <PreviewVisual
              geometry={geometry}
              patternClassName={selectedPattern.previewClassName}
              patternScale={state.patternScale}
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
                <dt className="font-control text-text-primary">
                  Pattern
                </dt>
                <dd className="break-words">
                  {selectedPattern?.name ?? "Not selected"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-control text-text-primary">
                  Face dimensions
                </dt>
                <dd className="break-words">{faceDimensions}</dd>
              </div>
              <div className="min-w-0">
                <dt className="font-control text-text-primary">
                  Thickness
                </dt>
                <dd className="break-words">{thickness}</dd>
              </div>
              <div className="min-w-0">
                <dt className="font-control text-text-primary">
                  Pattern scale
                </dt>
                <dd className="break-words">{formattedScale}</dd>
              </div>
            </dl>

            {selectedPattern ? (
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
