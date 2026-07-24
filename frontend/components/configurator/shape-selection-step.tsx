"use client";

import { useId } from "react";

import {
  useConfiguration,
  type CushionShape,
} from "@/context/configuration";

interface ShapeOption {
  readonly description: string;
  readonly disabled: boolean;
  readonly illustrationClassName: string;
  readonly label: string;
  readonly shape: CushionShape;
}

const shapeOptions: readonly ShapeOption[] = [
  {
    description: "A cushion with a face that is as wide as it is tall.",
    disabled: false,
    illustrationClassName: "aspect-square w-24",
    label: "Square cushion",
    shape: "square",
  },
  {
    description: "A cushion with a wider or taller rectangular face.",
    disabled: true,
    illustrationClassName: "aspect-[3/2] w-28",
    label: "Rectangle cushion",
    shape: "rectangle",
  },
  {
    description: "A cushion with a rectangular top and a deeper profile.",
    disabled: true,
    illustrationClassName:
      "aspect-[2/1] w-32 translate-y-[-0.2rem] shadow-[0_0.45rem_0_-0.1rem_var(--color-surface),0_0.45rem_0_0.05rem_var(--color-border-strong)]",
    label: "Box / bench cushion",
    shape: "box",
  },
];

export function ShapeSelectionStep() {
  const { state, dispatch } = useConfiguration();
  const generatedId = useId();
  const supportingTextId = `${generatedId}-supporting-text`;

  const selectShape = (shape: CushionShape) => {
    dispatch({ type: "setShape", shape });
  };

  return (
    <fieldset
      aria-describedby={supportingTextId}
      className="min-w-0 rounded-panel border border-border bg-surface p-card shadow-raised"
    >
      <legend className="max-w-full px-1 font-display text-section-title font-heading tracking-heading text-text-primary">
        Choose your cushion shape
      </legend>
      <p
        id={supportingTextId}
        className="mt-2 max-w-2xl break-words text-body text-text-muted"
      >
        Start with the overall face shape of the cushion you already have.
        Square cushions are available in this first configurator step.
      </p>

      <div className="mt-layout grid min-w-0 gap-component md:grid-cols-3">
        {shapeOptions.map((option) => {
          const optionId = `${generatedId}-${option.shape}`;
          const titleId = `${optionId}-title`;
          const descriptionId = `${optionId}-description`;
          const statusId = `${optionId}-status`;
          const isSelected = state.shape === option.shape;
          const status = isSelected
            ? option.disabled
              ? "Selected, but unavailable in this step"
              : "Selected"
            : option.disabled
              ? "Unavailable in this step"
              : "Available";

          return (
            <div key={option.shape} className="relative min-w-0">
              <input
                className="shape-option-input peer sr-only"
                id={optionId}
                type="radio"
                name="cushion-shape"
                value={option.shape}
                checked={isSelected}
                disabled={option.disabled}
                aria-labelledby={titleId}
                aria-describedby={`${descriptionId} ${statusId}`}
                onChange={() => selectShape(option.shape)}
              />
              <label
                htmlFor={optionId}
                className="shape-option-label flex min-h-44 min-w-0 cursor-pointer flex-col rounded-card border-2 border-border-strong bg-surface p-control-x shadow-card transition-[background-color,border-color,box-shadow,opacity] hover:bg-surface-subtle active:shadow-none peer-checked:border-brand peer-checked:bg-surface-subtle peer-disabled:cursor-not-allowed peer-disabled:border-control-disabled-border peer-disabled:bg-control-disabled-surface peer-disabled:text-control-disabled-text peer-disabled:opacity-75 motion-reduce:transition-none"
              >
                <span className="flex min-h-28 items-center justify-center rounded-control border border-border bg-page p-4">
                  <span
                    aria-hidden="true"
                    className={`${option.illustrationClassName} block max-w-full rounded-panel border-2 border-border-strong bg-surface shadow-card`}
                  />
                </span>

                <span className="mt-component flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="shape-option-control-indicator mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-pill border-2 border-border-strong bg-surface text-label font-control text-transparent"
                  >
                    {isSelected ? "✓" : option.disabled ? "—" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      id={titleId}
                      className="block break-words text-body font-control text-text-primary"
                    >
                      {option.label}
                    </span>
                    <span
                      id={descriptionId}
                      className="mt-1 block break-words text-supporting text-text-muted"
                    >
                      {option.description}
                    </span>
                    <span
                      id={statusId}
                      className="mt-3 inline-flex min-h-11 max-w-full items-center rounded-pill border border-current px-3 py-2 text-label font-control break-words text-brand"
                    >
                      {status}
                    </span>
                  </span>
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
