"use client";

import {
  useId,
  useEffect,
  useState,
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
import { CushionModel } from "./cushion-model";
import { Button } from "../ui";
import { AdvancedPreviewLoader } from "./advanced-preview-loader";

export interface SelectedPatternPresentation {
  readonly name: string;
  readonly previewClassName: string;
  readonly previewUrl?: string;
}

interface PreviewDetail {
  readonly label: string;
  readonly value: string;
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

    return `Enter a valid ${requiredMeasurements} to complete the preview details.`;
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
  const patternCanBeShown =
    selectedPattern !== null &&
    !patternIsLoading &&
    (!selectedPattern.previewUrl || selectedPattern.previewUrl !== failedPatternUrl) &&
    patternScaleIsValid;
  const previewIsComplete =
    measurementsAreValid &&
    patternCanBeShown;
  const formattedScale =
    formatPatternScale(state.patternScale) || "Invalid";

  if (state.shape === null) {
    return null;
  }

  const shape = state.shape;
  const definition = getCushionShapeDefinition(shape);
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
          <div className="cushion-preview-product-stage">
            <CushionModel
              patternClassName={patternCanBeShown ? selectedPattern?.previewClassName : undefined}
              patternName={patternCanBeShown ? selectedPattern?.name : undefined}
              patternUrl={patternCanBeShown ? patternObjectUrl : undefined}
              patternScale={state.patternScale}
              seamStyle={state.seamStyle}
            />
            <span className="cushion-preview-label">Illustrative preview</span>
          </div>
        }
        description={
          <div className="min-w-0">
            <h3 className="text-body font-control text-text-primary">Currently previewing</h3>
            <p role="status" className="mt-2 text-supporting text-text-muted">
              {failedPatternUrl && failedPatternUrl === selectedPattern?.previewUrl
                ? "The selected pattern could not be displayed. Neutral cushion shown; your measurements remain saved."
                : previewIsComplete
                  ? "Selected fabric shown on the cushion"
                  : patternIsLoading
                    ? "Loading your selected pattern… Neutral cushion shown."
                    : "Neutral cushion shown"}
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
                <p>{fitCharacter}. Fit is recorded with your design but intentionally does not reshape this reusable cushion model or alter the entered measurements. No fit allowances are calculated. Fit can affect fictional demonstration pricing.</p>
              </div>
              <div><h3 className="font-control text-text-primary">Shown in this preview</h3>
                <p>{patternCanBeShown ? `The selected pattern and motif scale on one consistent cushion model, with ${state.seamStyle === "piped" ? "a piped seam" : "a plain seam"}, permanent folds, highlights, and shadows.` : "A neutral cushion model. Choose an available pattern to apply it without changing the model’s size or silhouette."}</p>
              </div>
              <div><h3 className="font-control text-text-primary">Recorded in your design</h3>
                <p>Material: {findCoverOption(materialOptions, state.materialId).name}. Fabric feel and drape are not simulated. Closure / access: {findCoverOption(closureOptions, state.closureType).name}; not visible from this view. Construction details and fit are recorded without changing the reusable model.</p>
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
