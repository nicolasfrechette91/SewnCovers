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
  const range = getMeasurementRange(field, unit);
  const visibleRange = `${formatMeasurement(range.min)}–${formatMeasurement(range.max)} ${unit}`;

  if (field === "thickness") {
    return `Measure straight across the side profile. Enter ${visibleRange}.`;
  }

  if (field === "height") {
    return shape === "box"
      ? `Measure from front to back across the top. Enter ${visibleRange}.`
      : `Measure from top to bottom across the face. Enter ${visibleRange}.`;
  }

  if (shape === "square") {
    return `Measure straight across the face. Enter ${visibleRange}; height will match this value.`;
  }

  return shape === "box"
    ? `Measure from side to side across the top. Enter ${visibleRange}.`
    : `Measure from side to side across the face. Enter ${visibleRange}.`;
}

function ShapeMeasurementForm({
  height,
  shape,
  thickness,
  unit,
  width,
}: Readonly<{
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
    height: formatMeasurement(height),
    thickness: formatMeasurement(thickness),
    width: formatMeasurement(width),
  });
  const [errors, setErrors] = useState<MeasurementErrors>({
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
        shape === "square"
          ? { type: "setSquareWidth", width: value }
          : { type: "setWidth", width: value },
      );
      return;
    }

    if (field === "height") {
      dispatch({ type: "setHeight", height: value });
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
    setErrors({ height: null, thickness: null, width: null });
    dispatch({ type: "setMeasurementUnit", unit: nextUnit });
  };

  const renderMeasurementInput = (field: MeasurementField) => {
    const label = getMeasurementLabel(shape, field);
    const errorId = `${generatedId}-${field}-error`;

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
            {definition.measurementFields.map(renderMeasurementInput)}
          </div>
        </div>

        <MeasurementDiagram shape={shape} />
      </div>
    </fieldset>
  );
}

export function MeasurementStep() {
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
        height={state.height}
        shape={state.shape}
        thickness={state.thickness}
        unit={state.unit}
        width={state.width}
      />
    </section>
  );
}
