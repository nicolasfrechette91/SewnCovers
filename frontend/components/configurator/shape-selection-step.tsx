"use client";

import { useId } from "react";

import {
  useConfiguration,
  type CushionShape,
} from "@/context/configuration";
import { cushionShapeDefinitions } from "@/data/shapes";

import { ShapeIllustration } from "./shape-illustration";

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
        Start with the overall shape of the cushion you already have. Each
        option uses its own documented measurement terms in the next step.
      </p>

      <div className="mt-layout grid min-w-0 gap-component md:grid-cols-3">
        {cushionShapeDefinitions.map((option) => {
          const optionId = `${generatedId}-${option.id}`;
          const titleId = `${optionId}-title`;
          const descriptionId = `${optionId}-description`;
          const statusId = `${optionId}-status`;
          const isSelected = state.shape === option.id;

          return (
            <div key={option.id} className="relative min-w-0">
              <input
                className="shape-option-input peer sr-only"
                id={optionId}
                type="radio"
                name="cushion-shape"
                value={option.id}
                checked={isSelected}
                aria-labelledby={titleId}
                aria-describedby={`${descriptionId} ${statusId}`}
                onChange={() => selectShape(option.id)}
              />
              <label
                htmlFor={optionId}
                className="shape-option-label flex min-h-44 min-w-0 cursor-pointer flex-col rounded-card border-2 border-border-strong bg-surface p-control-x shadow-card transition-[background-color,border-color,box-shadow] hover:bg-surface-subtle active:shadow-none peer-checked:border-brand peer-checked:bg-surface-subtle motion-reduce:transition-none"
              >
                <span className="flex min-h-32 items-center justify-center rounded-control border border-border bg-page p-3">
                  <ShapeIllustration shape={option.id} />
                </span>

                <span className="mt-component flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="shape-option-control-indicator mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-pill border-2 border-border-strong bg-surface text-label font-control text-transparent"
                  >
                    {isSelected ? "✓" : ""}
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
                      {isSelected ? "Selected" : "Available"}
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
