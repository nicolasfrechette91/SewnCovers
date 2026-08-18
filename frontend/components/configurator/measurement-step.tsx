"use client";

import { useId, useState } from "react";

import { ErrorMessage, NumberInput, UnitSelector } from "@/components/ui";
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
type MeasurementErrors = Readonly<
  Record<MeasurementField, string | null>
>;

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

  const commitMeasurement = (
    field: MeasurementField,
    value: number | null,
  ) => {
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
        ? "Back width must be smaller than front width for this tapered shape."
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
          supportingText={getSupportingText(shape, field, unit)}
          invalid={visibleError !== null}
          aria-describedby={visibleError ? errorId : undefined}
          onChange={(event) => updateDraft(field, event.currentTarget.value)}
          onBlur={(event) =>
            normalizeDraft(field, event.currentTarget.value)
          }
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
    <fieldset className="min-w-0 rounded-panel border border-border bg-surface p-card shadow-raised">
      <legend
        id={focusTargetId}
        tabIndex={focusTargetId ? -1 : undefined}
        className="configurator-edit-target max-w-full scroll-mt-layout px-1 font-display text-section-title font-heading tracking-heading text-text-primary"
      >
        Measure your {definition.name.toLowerCase()} cushion
      </legend>
      <p className="mt-2 max-w-3xl break-words text-body text-text-muted">
        Use one unit for every measurement. Values are committed only when
        complete, finite, within the documented range, and no more than two
        decimal places.
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
            {definition.measurementFields.map(({ field }) =>
              renderMeasurementInput(field),
            )}
          </div>

          <details className="mt-component rounded-card border border-border bg-surface-subtle p-control-x py-3">
            <summary className="min-h-11 cursor-pointer py-2 text-button font-control text-brand">
              More measuring tips
            </summary>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-supporting text-text-muted">
              <li>Use the same tape and unit for every dimension.</li>
              <li>Measure the cushion itself, not the existing cover.</li>
              <li>
                Keep the tape straight and record the fullest point without
                adding an allowance.
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

export function MeasurementStep({
  focusTargetId,
}: MeasurementStepProps = {}) {
  const { state } = useConfiguration();

  if (state.shape === null) {
    return null;
  }

  return (
    <section
      aria-label={`${getCushionShapeDefinition(state.shape).name} cushion measurements`}
      className="mt-layout scroll-mt-layout"
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
