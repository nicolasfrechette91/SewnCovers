"use client";

import { useId, useState } from "react";

import {
  ErrorMessage,
  NumberInput,
  UnitSelector,
  surfaceClasses,
} from "@/components/ui";
import {
  formatMeasurement,
  getMeasurementRange,
  parseMeasurementDraft,
  useConfiguration,
  type CushionShape,
  type MeasurementDraftIssue,
  type MeasurementField,
  type MeasurementUnit,
} from "@/context/configuration";
import {
  getCushionShapeDefinition,
  getMeasurementLabel,
  getShapeMeasurementDefinition,
} from "@/data/shapes";

import { MeasurementDiagram } from "./measurement-diagram";

type MeasurementDrafts = Readonly<Record<MeasurementField, string>>;
type MeasurementErrors = Readonly<Record<MeasurementField, string | null>>;

function getValidationMessage(
  shape: CushionShape,
  field: MeasurementField,
  issue: MeasurementDraftIssue,
  unit: MeasurementUnit,
): string {
  const label = getMeasurementLabel(shape, field);
  const range = getMeasurementRange(field, unit);
  const visibleRange = `${formatMeasurement(range.min)}–${formatMeasurement(range.max)} ${unit}`;

  switch (issue) {
    case "required":
      return `Enter a ${label.toLowerCase()}.`;
    case "incomplete":
      return `Add a digit after the decimal point in the ${label.toLowerCase()}.`;
    case "invalid":
      return `Enter ${label.toLowerCase()} as a number, such as 45 or 45.5.`;
    case "precision":
      return `${label} can use no more than two decimal places.`;
    case "notPositive":
      return `${label} must be greater than zero.`;
    case "belowMinimum":
    case "aboveMaximum":
      return `${label} must be ${visibleRange}.`;
  }
}

function getSupportingText(
  shape: CushionShape,
  field: MeasurementField,
  unit: MeasurementUnit,
): string {
  const measurement = getShapeMeasurementDefinition(shape, field);
  const range = getMeasurementRange(field, unit);
  const visibleRange = `${formatMeasurement(range.min)}–${formatMeasurement(range.max)} ${unit}`;

  return `${measurement.tip} Enter ${visibleRange}. Example: ${measurement.example[unit]} ${unit}.`;
}

function ShapeMeasurementForm({
  focusTargetId,
  backWidth,
  height,
  shape,
  thickness,
  unit,
  width,
}: Readonly<{
  focusTargetId?: string;
  backWidth: number | null;
  height: number | null;
  shape: CushionShape;
  thickness: number | null;
  unit: MeasurementUnit;
  width: number | null;
}>) {
  const { dispatch } = useConfiguration();
  const definition = getCushionShapeDefinition(shape);
  const generatedId = useId();
  const unitDescriptionId = `${generatedId}-unit-description`;
  const [drafts, setDrafts] = useState<MeasurementDrafts>({
    backWidth: formatMeasurement(backWidth),
    height: formatMeasurement(height),
    thickness: formatMeasurement(thickness),
    width: formatMeasurement(width),
  });
  const [errors, setErrors] = useState<MeasurementErrors>({
    backWidth: null,
    height: null,
    thickness: null,
    width: null,
  });

  const commitMeasurement = (field: MeasurementField, value: number | null) => {
    if (field === "width") {
      dispatch(
        shape === "square" || shape === "round"
          ? { type: "setSquareWidth", width: value }
          : { type: "setWidth", width: value },
      );
      return;
    }

    if (field === "height") {
      dispatch({ type: "setHeight", height: value });
      return;
    }

    if (field === "backWidth") {
      dispatch({ type: "setBackWidth", backWidth: value });
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
        [field]: getValidationMessage(shape, field, issue, unit),
      }));
      return;
    }

    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [field]: formatMeasurement(result.value),
    }));
    setErrors((currentErrors) => ({
      ...currentErrors,
      [field]: null,
    }));
    commitMeasurement(field, result.value);
  };

  const changeUnit = (nextUnit: MeasurementUnit) => {
    setErrors({
      backWidth: null,
      height: null,
      thickness: null,
      width: null,
    });
    dispatch({ type: "setMeasurementUnit", unit: nextUnit });
  };

  const renderMeasurementInput = (field: MeasurementField) => {
    const label = getMeasurementLabel(shape, field);
    const errorId = `${generatedId}-${field}-error`;
    const parsedDraft = parseMeasurementDraft(drafts[field], field, unit);
    const relationshipError =
      shape === "tapered" &&
      field === "backWidth" &&
      parsedDraft.value !== null &&
      width !== null &&
      parsedDraft.value >= width
        ? "Back width must be smaller than front width."
        : null;
    const visibleError = errors[field] ?? relationshipError;

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
          unit={unit}
          supportingText={getSupportingText(shape, field, unit)}
          invalid={visibleError !== null}
          aria-describedby={visibleError ? errorId : undefined}
          onChange={(event) => updateDraft(field, event.currentTarget.value)}
          onBlur={(event) => normalizeDraft(field, event.currentTarget.value)}
        />
        {visibleError ? (
          <ErrorMessage
            id={errorId}
            className="mt-2"
            role="status"
            aria-live="polite"
          >
            {visibleError}
          </ErrorMessage>
        ) : null}
      </div>
    );
  };

  return (
    <fieldset className={surfaceClasses({ className: "fieldset-panel" })}>
      {/* From stage 2 the stage heading is the page's h1. */}
      <legend className="max-w-full pb-2">
        <h1
          id={focusTargetId}
          tabIndex={focusTargetId ? -1 : undefined}
          className="configurator-edit-target scroll-mt-layout font-display text-section-title font-heading tracking-heading text-text-primary"
        >
          Measure your {definition.name.toLowerCase()} cushion
        </h1>
      </legend>
      <p className="mt-2 max-w-reading break-words text-body text-text-muted">
        Measure the cushion itself, not its current cover.
      </p>

      <div className="mt-component grid min-w-0 gap-layout xl:grid-cols-[minmax(0,1fr)_minmax(16rem,0.8fr)] xl:items-start">
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
            Switching units converts the measurements you&apos;ve entered.
          </p>

          <div className="mt-component grid min-w-0 gap-component sm:grid-cols-2">
            {definition.measurementFields.map(({ field }) =>
              renderMeasurementInput(field),
            )}
          </div>

          <details className="mt-component rounded-card border border-dashed border-border-strong bg-page px-4 py-2">
            <summary className="flex min-h-11 cursor-pointer items-center text-button font-control text-brand underline decoration-1 underline-offset-4 hover:decoration-2">
              More measuring tips
            </summary>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-supporting text-text-muted">
              <li>Use the same tape and unit for every dimension.</li>
              <li>
                Keep the tape straight and measure at the fullest point.
                Don&apos;t add extra for seams.
              </li>
            </ul>
          </details>
        </div>

        <MeasurementDiagram shape={shape} />
      </div>
    </fieldset>
  );
}

export interface MeasurementStepProps {
  focusTargetId?: string;
}

export function MeasurementStep({ focusTargetId }: MeasurementStepProps = {}) {
  const { state } = useConfiguration();

  if (state.shape === null) {
    return null;
  }

  return (
    <section
      aria-label={`${getCushionShapeDefinition(state.shape).name} cushion measurements`}
      className="scroll-mt-layout"
    >
      <ShapeMeasurementForm
        key={`${state.shape}-${state.unit}`}
        backWidth={state.backWidth}
        focusTargetId={focusTargetId}
        height={state.height}
        shape={state.shape}
        thickness={state.thickness}
        unit={state.unit}
        width={state.width}
      />
    </section>
  );
}
