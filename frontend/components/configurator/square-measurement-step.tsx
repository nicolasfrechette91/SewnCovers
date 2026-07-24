"use client";

import { useId, useState } from "react";

import { ErrorMessage, NumberInput, UnitSelector } from "@/components/ui";
import {
  formatMeasurement,
  getMeasurementRange,
  parseMeasurementDraft,
  useConfiguration,
  type MeasurementDraftIssue,
  type MeasurementField,
  type MeasurementUnit,
} from "@/context/configuration";

interface MeasurementDrafts {
  readonly thickness: string;
  readonly width: string;
}

interface MeasurementErrors {
  readonly thickness: string | null;
  readonly width: string | null;
}

const measurementLabels: Readonly<Record<MeasurementField, string>> = {
  thickness: "Thickness",
  width: "Width",
};

function getValidationMessage(
  field: MeasurementField,
  issue: MeasurementDraftIssue,
  unit: MeasurementUnit,
): string {
  const label = measurementLabels[field];
  const range = getMeasurementRange(field, unit);
  const visibleRange = `${formatMeasurement(range.min)}–${formatMeasurement(range.max)} ${unit}`;

  switch (issue) {
    case "required":
      return `Enter a ${label.toLowerCase()}.`;
    case "incomplete":
      return `Finish entering the ${label.toLowerCase()} after the decimal separator.`;
    case "invalid":
      return `Enter ${label.toLowerCase()} as a number, such as 45 or 45.5.`;
    case "precision":
      return `${label} can use no more than two decimal places.`;
    case "notPositive":
      return `${label} must be greater than zero.`;
    case "belowMinimum":
    case "aboveMaximum":
      return `${label} must be between ${visibleRange}.`;
  }
}

function MeasurementDiagram() {
  return (
    <figure className="min-w-0 rounded-card border border-border bg-surface-subtle p-card">
      <div className="grid min-w-0 gap-component sm:grid-cols-2">
        <div className="min-w-0 rounded-control border border-border bg-surface p-control-x py-4">
          <p className="text-label font-control tracking-label text-text-primary">
            Width
          </p>
          <div
            aria-hidden="true"
            className="measurement-diagram-geometry mx-auto mt-component aspect-square w-full max-w-40 rounded-panel border-2 border-border-strong bg-page shadow-card"
          />
          <p className="mt-3 text-center text-supporting text-text-muted">
            Across the square face
          </p>
        </div>

        <div className="min-w-0 rounded-control border border-border bg-surface p-control-x py-4">
          <p className="text-label font-control tracking-label text-text-primary">
            Thickness
          </p>
          <div
            aria-hidden="true"
            className="measurement-diagram-geometry mx-auto mt-layout h-12 w-full max-w-48 rounded-control border-2 border-border-strong bg-page shadow-card"
          />
          <p className="mt-layout text-center text-supporting text-text-muted">
            Across the side profile
          </p>
        </div>
      </div>
      <figcaption className="mt-component text-supporting text-text-muted">
        Measure width straight across the square face. Measure thickness
        straight across one side profile. The square face uses the same
        committed value for width and height.
      </figcaption>
    </figure>
  );
}

function SquareMeasurementForm({
  thickness,
  unit,
  width,
}: Readonly<{
  thickness: number | null;
  unit: MeasurementUnit;
  width: number | null;
}>) {
  const { dispatch } = useConfiguration();
  const generatedId = useId();
  const unitDescriptionId = `${generatedId}-unit-description`;
  const [drafts, setDrafts] = useState<MeasurementDrafts>({
    thickness: formatMeasurement(thickness),
    width: formatMeasurement(width),
  });
  const [errors, setErrors] = useState<MeasurementErrors>({
    thickness: null,
    width: null,
  });

  const commitMeasurement = (
    field: MeasurementField,
    value: number | null,
  ) => {
    if (field === "width") {
      dispatch({ type: "setSquareWidth", width: value });
      return;
    }

    dispatch({ type: "setThickness", thickness: value });
  };

  const updateDraft = (field: MeasurementField, draft: string) => {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [field]: draft,
    }));

    const result = parseMeasurementDraft(draft, field, unit);

    if (result.issue === null) {
      commitMeasurement(field, result.value);
      setErrors((currentErrors) =>
        currentErrors[field] === null
          ? currentErrors
          : { ...currentErrors, [field]: null },
      );
    }
  };

  const normalizeDraft = (field: MeasurementField, draft: string) => {
    const result = parseMeasurementDraft(draft, field, unit);
    const issue = result.issue;

    if (issue !== null) {
      if (issue === "required") {
        commitMeasurement(field, null);
      }

      setErrors((currentErrors) => ({
        ...currentErrors,
        [field]: getValidationMessage(field, issue, unit),
      }));
      return;
    }

    const normalizedDraft = formatMeasurement(result.value);
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [field]: normalizedDraft,
    }));
    setErrors((currentErrors) => ({
      ...currentErrors,
      [field]: null,
    }));
    commitMeasurement(field, result.value);
  };

  const changeUnit = (nextUnit: MeasurementUnit) => {
    setErrors({ thickness: null, width: null });
    dispatch({ type: "setMeasurementUnit", unit: nextUnit });
  };

  const renderMeasurementInput = (field: MeasurementField) => {
    const label = measurementLabels[field];
    const errorId = `${generatedId}-${field}-error`;
    const range = getMeasurementRange(field, unit);
    const supportingText =
      field === "width"
        ? `Measure straight across the face. Enter ${formatMeasurement(range.min)}–${formatMeasurement(range.max)} ${unit}; height will match this value.`
        : `Measure the side profile. Enter ${formatMeasurement(range.min)}–${formatMeasurement(range.max)} ${unit}.`;

    return (
      <div className="min-w-0" key={field}>
        <NumberInput
          id={`${generatedId}-${field}`}
          name={field}
          type="text"
          inputMode="decimal"
          step="0.01"
          required
          spellCheck={false}
          value={drafts[field]}
          label={`${label} (${unit})`}
          supportingText={supportingText}
          invalid={errors[field] !== null}
          aria-describedby={errors[field] ? errorId : undefined}
          onChange={(event) => updateDraft(field, event.currentTarget.value)}
          onBlur={(event) =>
            normalizeDraft(field, event.currentTarget.value)
          }
        />
        {errors[field] ? (
          <ErrorMessage
            id={errorId}
            className="mt-2"
            role="status"
            aria-live="polite"
          >
            {errors[field]}
          </ErrorMessage>
        ) : null}
      </div>
    );
  };

  return (
    <fieldset className="min-w-0 rounded-panel border border-border bg-surface p-card shadow-raised">
      <legend className="max-w-full px-1 font-display text-section-title font-heading tracking-heading text-text-primary">
        Measure your square cushion
      </legend>
      <p className="mt-2 max-w-3xl break-words text-body text-text-muted">
        Use the same unit for both measurements. Values are committed only
        when they are complete, finite, within the documented range, and use
        no more than two decimal places.
      </p>

      <div className="mt-layout grid min-w-0 gap-layout lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)]">
        <div className="min-w-0">
          <UnitSelector
            name="measurement-unit"
            value={unit}
            onChange={changeUnit}
            aria-describedby={unitDescriptionId}
          />
          <p
            id={unitDescriptionId}
            className="mt-2 text-supporting text-text-muted"
          >
            Changing units converts every committed measurement using 1 inch
            = 2.54 centimetres.
          </p>

          <div className="mt-component grid min-w-0 gap-component sm:grid-cols-2">
            {renderMeasurementInput("width")}
            {renderMeasurementInput("thickness")}
          </div>
        </div>

        <MeasurementDiagram />
      </div>
    </fieldset>
  );
}

export function SquareMeasurementStep() {
  const { state } = useConfiguration();

  if (state.shape !== "square") {
    return null;
  }

  return (
    <section
      aria-label="Square cushion measurements"
      className="mt-layout scroll-mt-layout"
    >
      <SquareMeasurementForm
        key={state.unit}
        thickness={state.thickness}
        unit={state.unit}
        width={state.width}
      />
    </section>
  );
}
