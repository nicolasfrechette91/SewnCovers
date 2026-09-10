"use client";

import {
  useId,
  useEffect,
  useState,
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
import {
  getCushionShapeDefinition,
} from "@/data/shapes";

import { CushionPreview } from "./cushion-preview";
import { Button } from "../ui";
import { AdvancedPreviewLoader } from "./advanced-preview-loader";
import {
  calculatePreviewGeometry,
  PREVIEW_VIEWBOX_HEIGHT,
  PREVIEW_VIEWBOX_WIDTH,
  type PreviewGeometry,
} from "./preview-calculations";

type PatternStyle = CSSProperties & {
  "--pattern-scale": number;
};

export interface SelectedPatternPresentation {
  readonly name: string;
  readonly previewClassName: string;
  readonly previewUrl?: string;
}

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
  patternUrl,
  patternScale,
  shape,
  seamStyle,
}: Readonly<{
  fitPreference: FitPreference;
  geometry: PreviewGeometry;
  patternClassName: string;
  patternUrl?: string;
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
    backgroundImage: patternUrl ? `url("${patternUrl}")` : undefined,
    backgroundSize: patternUrl
      ? `${Math.round(160 * patternScale)}px auto`
      : undefined,
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
  onEdit?: (stage: "measurements" | "details" | "pattern") => void;
  focusTargetId?: string;
  selectedPattern: SelectedPatternPresentation | null;
  showScaleControls?: boolean;
}

export function PreviewStep(props: PreviewStepProps) {
  // Image readiness belongs to this source, never to a previously revoked URL.
  // Configuration and scale remain in the existing provider.
  return <PreviewStepContent key={props.selectedPattern?.previewUrl ?? "built-in"} {...props} />;
}

function PreviewStepContent({
  onEdit,
  focusTargetId,
  selectedPattern,
  showScaleControls = true,
}: PreviewStepProps) {
  const { state, dispatch } = useConfiguration();
  const [failedPatternUrl, setFailedPatternUrl] = useState<string | null>(null);
  const [loadedPatternUrl, setLoadedPatternUrl] = useState<string | null>(null);
  const [patternImage, setPatternImage] = useState<{ source: string; url: string } | null>(null);
  const patternSourceUrl = selectedPattern?.previewUrl;
  const patternObjectUrl = patternImage?.source === patternSourceUrl ? patternImage?.url : undefined;
  useEffect(() => {
    if (!patternSourceUrl) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    // Consume only the derivative already authorized by the existing selection
    // flow. A local object URL respects the image CSP without broadening it.
    void fetch(patternSourceUrl, { credentials: "omit", cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Pattern unavailable");
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPatternImage({ source: patternSourceUrl, url: objectUrl });
      })
      .catch(() => { if (!cancelled) setFailedPatternUrl(patternSourceUrl); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [patternSourceUrl]);
  const patternIsLoading = Boolean(selectedPattern?.previewUrl &&
    selectedPattern.previewUrl !== failedPatternUrl &&
    selectedPattern.previewUrl !== loadedPatternUrl);
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
    !patternIsLoading &&
    (!selectedPattern.previewUrl || selectedPattern.previewUrl !== failedPatternUrl) &&
    patternScaleIsValid &&
    geometry !== null;
  const formattedScale =
    formatPatternScale(state.patternScale) || "Invalid";

  if (state.shape === null) {
    return null;
  }

  const shape = state.shape;
  const definition = getCushionShapeDefinition(shape);
  const fitIsDrawn = shape === "square" || shape === "rectangle";
  const fitCharacter = state.fitPreference === "close"
    ? "A neater, crisper profile"
    : state.fitPreference === "relaxed"
      ? "A softer, more relaxed profile"
      : "A balanced profile";
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
        balanced
        title={`Preview your ${definition.name.toLowerCase()} cushion`}
        emptyMessage={failedPatternUrl && failedPatternUrl === selectedPattern?.previewUrl
          ? "The selected pattern could not be displayed. Change pattern to choose an available pattern. Your measurements remain saved."
          : patternIsLoading ? "Loading your selected pattern…"
          : getEmptyMessage(
          shape,
          measurementsAreValid,
          selectedPattern !== null,
          state.pattern !== null,
          patternScaleIsValid,
        )}
        visual={
          previewIsComplete ? (
            <PreviewVisual
              fitPreference={state.fitPreference}
              geometry={geometry}
              patternClassName={selectedPattern.previewClassName}
              patternUrl={patternObjectUrl}
              patternScale={state.patternScale}
              shape={shape}
              seamStyle={state.seamStyle}
            />
          ) : undefined
        }
        description={
          <div className="min-w-0">
            <h3 className="text-body font-control text-text-primary">Currently previewing</h3>
            <p role="status" className="mt-2 text-supporting text-text-muted">
              {previewIsComplete
                ? "Current proportional preview"
                : "Preview incomplete"}
            </p>
            {selectedPattern?.previewUrl && patternObjectUrl ? (
              // Observe failure of the same authorized derivative used by the face.
              // No new grant, original, or fallback URL is requested.
              // eslint-disable-next-line @next/next/no-img-element
              <img key={patternObjectUrl} hidden alt="" src={patternObjectUrl} onLoad={() => setLoadedPatternUrl(selectedPattern.previewUrl!)} onError={() => setFailedPatternUrl(selectedPattern.previewUrl!)} />
            ) : null}
            <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="font-control text-text-primary">Shape</dt>
                <dd className="break-words">{definition.name}</dd>
              </div>
              <div className="min-w-0">
                <dt className="font-control text-text-primary">Fit preference</dt>
                <dd className="break-words">
                  {findCoverOption(fitOptions, state.fitPreference).name}
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
                    (state.pattern === null
                      ? "Not selected"
                      : "Selected pattern unavailable")}
                  {state.pattern ? <span className="block text-supporting">{state.pattern.kind === "custom" ? "Custom pattern" : "Built-in pattern"} · {previewIsComplete ? "Selected and shown" : patternIsLoading ? "Selected; loading preview" : "Selected; preview unavailable"}</span> : null}
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
            <p className="mt-3 hidden forced-colors:block">High-contrast settings may hide pattern colors and motifs. Use the selected pattern name and scale above as your text alternative.</p>
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
                    id={`${scaleControlId}-output`}
                    aria-live="off"
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
                  aria-describedby={`${scaleDescriptionId} ${scaleControlId}-output`}
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
                  Smaller values show finer motifs; larger values show bolder motifs.
                  1.0× is the default visual scale, not actual fabric size.
                  Pattern size changes the preview motif only, not entered cushion dimensions or demonstration pricing.
                </p>
              </div>
            ) : null}
            <div className="mt-component space-y-3">
              <div><h3 className="font-control text-text-primary">How fit is represented</h3>
                <p>{fitCharacter}. {fitIsDrawn
                  ? `The face outline uses ${state.fitPreference === "close" ? "tighter" : state.fitPreference === "relaxed" ? "rounder" : "moderately rounded"} corners to suggest this preference.`
                  : "This shape has the same outline for every fit preference; fit is recorded only."} Fit styling is indicative only and does not alter the entered measurements. No fit allowances are calculated. Fit can affect fictional demonstration pricing.</p>
              </div>
              <div><h3 className="font-control text-text-primary">Shown in this preview</h3>
                <p>{previewIsComplete ? `Shape, face proportions, projected thickness, pattern and motif scale, and ${state.seamStyle === "piped" ? "a piped edge outline" : "a plain edge outline"}${fitIsDrawn ? ", with qualitative fit corners" : ""}.` : "The visual is unavailable until the preview is complete; current design values remain listed above."}</p>
              </div>
              <div><h3 className="font-control text-text-primary">Recorded in your design</h3>
                <p>Material: {findCoverOption(materialOptions, state.materialId).name}. Fabric feel and drape are not simulated. Closure / access: {findCoverOption(closureOptions, state.closureType).name}; not visible from this view. Construction details are not drawn{fitIsDrawn ? "." : "; fit is also recorded without a visual change for this shape."}</p>
              </div>
            </div>

            {onEdit ? <nav aria-label="Adjust this preview" className="mt-component flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => onEdit("measurements")}>Edit measurements</Button>
              <Button variant="secondary" onClick={() => onEdit("details")}>Edit cover details</Button>
              <Button variant="secondary" onClick={() => onEdit("pattern")}>Change pattern</Button>
            </nav> : null}
            <p className="mt-component rounded-card border border-border-strong p-3 text-supporting text-text-muted">Illustrative preview only, not a manufacturing specification. It does not calculate seam allowances or cutting instructions, and cannot guarantee color, texture, scale, fit, or finished appearance. Not every saved setting is visually represented.</p>
          </div>
        }
      />
      {previewIsComplete &&
      selectedPattern !== null &&
      ["square", "rectangle", "box"].includes(shape) ? (
        <AdvancedPreviewLoader
          configuration={state}
          patternName={selectedPattern.name}
          textureUrl={patternObjectUrl}
        />
      ) : null}
    </section>
  );
}
