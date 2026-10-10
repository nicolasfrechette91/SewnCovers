"use client";

import { useId, useEffect, useState, type ChangeEvent } from "react";

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
import { findCoverOption, fitOptions, seamOptions } from "@/data/cover-options";
import { getCushionShapeDefinition } from "@/data/shapes";
import { fetchPatternImage } from "@/services/pattern-image";

import { CushionPreview } from "./cushion-preview";
import { CushionModel } from "./cushion-model";
import { Button, buttonClasses, noticeClasses, Surface, SpecList } from "../ui";

/** Value text for the specification list: the details panel sets the size. */
const inheritedValue = "break-words text-text-primary";

export interface SelectedPatternPresentation {
  readonly name: string;
  readonly previewClassName: string;
  readonly previewUrl?: string;
  readonly solidColor?: string;
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
  /**
   * "stage" is the full Preview stage; "summary" is the image and caption
   * only, for Review.
   */
  variant?: "stage" | "summary";
}

export function PreviewStep(props: PreviewStepProps) {
  // Image readiness belongs to this source, never to a previously revoked URL.
  // Configuration and scale remain in the existing provider.
  return (
    <PreviewStepContent
      key={
        props.selectedPattern?.previewUrl ??
        props.selectedPattern?.solidColor ??
        "built-in"
      }
      {...props}
    />
  );
}

function PreviewStepContent({
  onEdit,
  focusTargetId,
  selectedPattern,
  variant = "stage",
}: PreviewStepProps) {
  const { state, dispatch } = useConfiguration();
  const [failedPatternUrl, setFailedPatternUrl] = useState<string | null>(null);
  const [loadedPatternUrl, setLoadedPatternUrl] = useState<string | null>(null);
  const [patternImage, setPatternImage] = useState<{
    source: string;
    url: string;
  } | null>(null);
  const patternSourceUrl = selectedPattern?.previewUrl;
  const patternObjectUrl =
    patternImage?.source === patternSourceUrl ? patternImage?.url : undefined;
  useEffect(() => {
    if (!patternSourceUrl) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    // Consume only the derivative already authorized by the existing selection
    // flow. A local object URL respects the image CSP without broadening it.
    void fetchPatternImage(patternSourceUrl, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPatternImage({ source: patternSourceUrl, url: objectUrl });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailedPatternUrl(patternSourceUrl);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [patternSourceUrl]);
  const patternIsLoading = Boolean(
    selectedPattern?.previewUrl &&
    selectedPattern.previewUrl !== failedPatternUrl &&
    selectedPattern.previewUrl !== loadedPatternUrl,
  );
  const generatedId = useId();
  const scaleControlId = focusTargetId ?? `${generatedId}-pattern-scale`;
  const scaleDescriptionId = `${scaleControlId}-description`;
  const measurementsAreValid = hasValidMeasurementsForShape(
    state.shape,
    state.width,
    state.height,
    state.thickness,
    state.unit,
    state.backWidth,
  );
  const patternScaleIsValid = isPatternScaleWithinRange(state.patternScale);
  const patternCanBeShown =
    selectedPattern !== null &&
    !patternIsLoading &&
    (!selectedPattern.previewUrl ||
      selectedPattern.previewUrl !== failedPatternUrl) &&
    patternScaleIsValid;
  const previewIsComplete = measurementsAreValid && patternCanBeShown;
  const formattedScale = formatPatternScale(state.patternScale) || "Invalid";

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
        isMeasurementWithinRange(measurementValues[field], field, state.unit),
        state.unit,
      ),
    }));

  const changePatternScale = (event: ChangeEvent<HTMLInputElement>) => {
    dispatch({
      type: "setPatternScale",
      patternScale: Number(event.currentTarget.value),
    });
  };

  const adjustPatternScale = (adjustment: number) => {
    dispatch({
      type: "setPatternScale",
      patternScale: Number((state.patternScale + adjustment).toFixed(1)),
    });
  };

  const isSummary = variant === "summary";
  const patternFailed = Boolean(
    failedPatternUrl && failedPatternUrl === selectedPattern?.previewUrl,
  );
  const statusText = patternFailed
    ? "Your pattern couldn't be shown, so the cushion is plain. Your measurements are saved."
    : previewIsComplete
      ? `${selectedPattern?.solidColor ? "Solid colour" : selectedPattern?.name} on your ${definition.name.toLowerCase()} cushion`
      : patternIsLoading
        ? "Loading your pattern…"
        : "No fabric shown yet";
  // Observe failure of the same authorized derivative used by the face.
  // No new grant, original, or fallback URL is requested.
  const patternProbe =
    selectedPattern?.previewUrl && patternObjectUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={patternObjectUrl}
        hidden
        alt=""
        src={patternObjectUrl}
        onLoad={() => setLoadedPatternUrl(selectedPattern.previewUrl!)}
        onError={() => setFailedPatternUrl(selectedPattern.previewUrl!)}
      />
    ) : null;

  return (
    <section
      aria-label={`${definition.name} cushion preview`}
      className="@container scroll-mt-layout"
    >
      <CushionPreview
        balanced={!isSummary}
        headingLevel={isSummary ? 2 : 1}
        title={
          isSummary
            ? "Preview"
            : `Preview your ${definition.name.toLowerCase()} cushion`
        }
        emptyMessage={
          patternFailed
            ? "Your pattern couldn't be shown. Choose another pattern; your measurements are saved."
            : patternIsLoading
              ? "Loading your selected pattern…"
              : getEmptyMessage(
                  shape,
                  measurementsAreValid,
                  selectedPattern !== null,
                  state.pattern !== null,
                  patternScaleIsValid,
                )
        }
        visual={
          <div className="cushion-preview-product-stage">
            <CushionModel
              patternClassName={
                patternCanBeShown
                  ? selectedPattern?.previewClassName
                  : undefined
              }
              patternName={
                patternCanBeShown ? selectedPattern?.name : undefined
              }
              patternUrl={patternCanBeShown ? patternObjectUrl : undefined}
              solidColor={
                patternCanBeShown ? selectedPattern?.solidColor : undefined
              }
              patternScale={state.patternScale}
              seamStyle={state.seamStyle}
              shape={shape}
              width={state.width}
              height={state.height}
              backWidth={state.backWidth}
              thickness={state.thickness}
            />
          </div>
        }
        details={
          isSummary ? (
            patternProbe
          ) : (
            <>
              <p role="status" className="text-supporting text-text-muted">
                {statusText}
              </p>
              {patternProbe}
              <SpecList
                className="mt-4"
                columns="container"
                framed
                items={[
                  {
                    label: "Shape",
                    value: definition.name,
                    valueClassName: inheritedValue,
                  },
                  {
                    label: "Fit",
                    value: findCoverOption(fitOptions, state.fitPreference)
                      .name,
                    valueClassName: inheritedValue,
                  },
                  {
                    label: "Edge finish",
                    value: findCoverOption(seamOptions, state.seamStyle).name,
                    valueClassName: inheritedValue,
                  },
                  {
                    label: "Fabric",
                    valueClassName:
                      "flex min-w-0 items-center gap-2 break-words text-text-primary",
                    value: (
                      <>
                        {selectedPattern?.solidColor ? (
                          <span
                            aria-hidden="true"
                            className="fabric-swatch inline-block size-3 shrink-0 rounded-pill border border-border-strong"
                            style={{
                              backgroundColor: selectedPattern.solidColor,
                            }}
                          />
                        ) : null}
                        <span className="min-w-0">
                          {selectedPattern?.name ??
                            (state.pattern === null
                              ? "Not selected"
                              : "No longer available")}
                          {state.pattern?.kind === "custom" ? (
                            <span className="block text-supporting">
                              Your own pattern
                            </span>
                          ) : null}
                          {state.pattern && !previewIsComplete ? (
                            <span className="block text-supporting">
                              {patternIsLoading
                                ? "Loading preview…"
                                : "Preview unavailable"}
                            </span>
                          ) : null}
                        </span>
                      </>
                    ),
                  },
                  ...dimensionDetails.map((detail) => ({
                    key: detail.label,
                    label: detail.label,
                    value: detail.value,
                    valueClassName: inheritedValue,
                  })),
                  ...(selectedPattern?.solidColor
                    ? []
                    : [
                        {
                          label: "Pattern size",
                          value: formattedScale,
                          valueClassName: inheritedValue,
                        },
                      ]),
                ]}
              />
              <p className="mt-3 hidden forced-colors:block">
                {selectedPattern?.solidColor
                  ? "High-contrast mode may not show your colour in the illustration. The swatch above keeps it."
                  : "High-contrast mode may hide the pattern. Its name and size are listed above."}
              </p>
            </>
          )
        }
        controls={
          isSummary ? undefined : (
            <div className="flex min-w-0 flex-col gap-component">
              {selectedPattern && !selectedPattern.solidColor ? (
                <Surface
                  tone="subtle"
                  elevation="flat"
                  padding="compact"
                  radius="card"
                  className="sm:p-5"
                >
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
                      className="font-mono text-readout tabular-nums text-brand"
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
                      className={buttonClasses({
                        className: "min-w-0",
                        size: "compact",
                        variant: "secondary",
                      })}
                      type="button"
                      disabled={state.patternScale <= PATTERN_SCALE_MIN}
                      aria-describedby={scaleDescriptionId}
                      onClick={() => adjustPatternScale(-PATTERN_SCALE_STEP)}
                    >
                      Smaller
                    </button>
                    <button
                      className={buttonClasses({
                        className: "min-w-0",
                        size: "compact",
                        variant: "secondary",
                      })}
                      type="button"
                      disabled={state.patternScale >= PATTERN_SCALE_MAX}
                      aria-describedby={scaleDescriptionId}
                      onClick={() => adjustPatternScale(PATTERN_SCALE_STEP)}
                    >
                      Larger
                    </button>
                  </div>
                  <p
                    id={scaleDescriptionId}
                    className="mt-2 break-words text-supporting text-text-muted"
                  >
                    From {PATTERN_SCALE_MIN.toFixed(1)}× (smaller motifs) to{" "}
                    {PATTERN_SCALE_MAX.toFixed(1)}× (bolder motifs). 1.0× is the
                    standard size.
                  </p>
                </Surface>
              ) : null}

              {onEdit ? (
                <div
                  role="group"
                  aria-label="Adjust this preview"
                  className="grid gap-3 sm:flex sm:flex-wrap"
                >
                  <Button
                    variant="secondary"
                    onClick={() => onEdit("measurements")}
                  >
                    Edit measurements
                  </Button>
                  <Button variant="secondary" onClick={() => onEdit("details")}>
                    Edit cover details
                  </Button>
                  <Button variant="secondary" onClick={() => onEdit("pattern")}>
                    Change pattern
                  </Button>
                </div>
              ) : null}
            </div>
          )
        }
        description={
          isSummary ? (
            <p>{statusText}</p>
          ) : (
            <p className={noticeClasses("prototype")}>
              Illustrative preview. The finished cover&apos;s colour, pattern
              size and fit may differ.
            </p>
          )
        }
      />
    </section>
  );
}
