"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui";
import {
  useConfiguration,
  type CushionShape,
} from "@/context/configuration";
import {
  cushionShapeDefinitions,
  getCushionShapeDefinition,
} from "@/data/shapes";

import { ShapeIllustration } from "./shape-illustration";

export interface ShapeSelectionStepProps {
  focusTargetId?: string;
}

export function ShapeSelectionStep({
  focusTargetId,
}: ShapeSelectionStepProps = {}) {
  const { state, dispatch } = useConfiguration();
  const generatedId = useId();
  const supportingTextId = `${generatedId}-supporting-text`;
  const [pendingShape, setPendingShape] = useState<CushionShape | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pendingShape !== null) {
      confirmButtonRef.current?.focus();
    }
  }, [pendingShape]);

  const selectShape = (shape: CushionShape) => {
    const makesDimensionsEqual = shape === "square" || shape === "round";
    if (
      makesDimensionsEqual &&
      state.width !== null &&
      state.height !== null &&
      state.width !== state.height
    ) {
      setPendingShape(shape);
      return;
    }

    dispatch({ type: "setShape", shape });
  };

  return (
    <fieldset
      aria-describedby={supportingTextId}
      className="fieldset-panel min-w-0 rounded-panel border border-border bg-surface p-card shadow-hairline"
    >
      {/* The page header holds the h1 on this stage, so this is an h2. */}
      <legend className="max-w-full pb-2">
        <h2
          id={focusTargetId}
          tabIndex={focusTargetId ? -1 : undefined}
          className="configurator-edit-target scroll-mt-layout font-display text-section-title font-heading tracking-heading text-text-primary"
        >
          Choose your cushion shape
        </h2>
      </legend>
      <p
        id={supportingTextId}
        className="mt-2 max-w-2xl break-words text-body text-text-muted"
      >
        Pick the shape closest to the cushion you have. You&apos;ll measure
        it next.
      </p>

      <div className="mt-component grid min-w-0 gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-5">
        {cushionShapeDefinitions.map((option) => {
          const optionId = `${generatedId}-${option.id}`;
          const titleId = `${optionId}-title`;
          const descriptionId = `${optionId}-description`;
          const isSelected = state.shape === option.id;

          return (
            <div key={option.id} className="relative h-full min-w-0">
              <input
                className="shape-option-input peer sr-only"
                id={optionId}
                type="radio"
                name="cushion-shape"
                value={option.id}
                required
                checked={isSelected}
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                onChange={() => selectShape(option.id)}
              />
              <label
                htmlFor={optionId}
                className="shape-option-label choice-card flex h-full min-h-44 min-w-0 flex-col p-3 sm:p-4"
              >
                <span className="flex min-h-24 items-center justify-center rounded-control bg-page p-2 sm:min-h-32 sm:p-3">
                  <ShapeIllustration
                    shape={option.id}
                    className="h-20 w-full max-w-48 sm:h-28"
                  />
                </span>

                <span className="mt-4 flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-start gap-2 sm:gap-3">
                    <span
                      aria-hidden="true"
                      className="shape-option-control-indicator choice-indicator mt-0.5"
                    >
                      {isSelected ? "✓" : ""}
                    </span>
                    <span
                      id={titleId}
                      className="block min-w-0 break-words text-subhead font-control text-text-primary"
                    >
                      {option.label}
                    </span>
                  </span>
                  <span
                    id={descriptionId}
                    className="mt-2 block break-words text-supporting text-text-muted hyphens-auto"
                  >
                    {option.description}
                  </span>
                </span>
              </label>
            </div>
          );
        })}
      </div>

      {pendingShape !== null ? (
        <section
          aria-labelledby={`${generatedId}-shape-change-heading`}
          className="mt-component rounded-card border border-accent bg-surface p-4 shadow-raised sm:p-5"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setPendingShape(null);
            }
          }}
        >
          <h3
            id={`${generatedId}-shape-change-heading`}
            className="text-subhead font-control text-text-primary"
          >
            Use the same width and height?
          </h3>
          <p className="mt-2 text-supporting text-text-muted">
            A {getCushionShapeDefinition(pendingShape).name.toLowerCase()}{" "}
            cushion has one face size, so its height will match your width (
            {state.width} {state.unit}). Everything else stays as it is.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              ref={confirmButtonRef}
              onClick={() => {
                dispatch({ type: "setShape", shape: pendingShape });
                setPendingShape(null);
              }}
            >
              Use the width for both
            </Button>
            <Button variant="secondary" onClick={() => setPendingShape(null)}>
              Keep current shape
            </Button>
          </div>
          <p className="mt-2 text-supporting text-text-muted">
            Press Escape to keep the current shape.
          </p>
        </section>
      ) : null}
    </fieldset>
  );
}
