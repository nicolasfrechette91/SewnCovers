"use client";

import { useId } from "react";

import { PatternCard } from "@/components/configurator/pattern-card";
import {
  hasValidMeasurementsForShape,
  useConfiguration,
} from "@/context/configuration";
import { prototypePatterns } from "@/data/patterns";

export function PatternStep() {
  const { state, dispatch } = useConfiguration();
  const generatedId = useId();
  const supportingTextId = `${generatedId}-supporting-text`;

  if (
    !hasValidMeasurementsForShape(
      state.shape,
      state.width,
      state.height,
      state.thickness,
      state.unit,
    )
  ) {
    return null;
  }

  return (
    <section
      aria-label="Pattern selection"
      className="mt-layout scroll-mt-layout"
    >
      <fieldset
        aria-describedby={supportingTextId}
        className="min-w-0 rounded-panel border border-border bg-surface p-card shadow-raised"
      >
        <legend className="max-w-full px-1 font-display text-section-title font-heading tracking-heading text-text-primary">
          Choose a prototype pattern
        </legend>
        <p
          id={supportingTextId}
          className="mt-2 max-w-3xl break-words text-body text-text-muted"
        >
          Compare three local visual samples. Choose one pattern direction
          for this configuration.
        </p>

        <div className="mt-layout grid min-w-0 gap-component sm:grid-cols-2 lg:grid-cols-3">
          {prototypePatterns.map((pattern) => {
            const optionId = `${generatedId}-${pattern.id}`;

            return (
              <PatternCard
                key={pattern.id}
                id={optionId}
                name="cushion-pattern"
                value={pattern.id}
                checked={state.patternId === pattern.id}
                patternName={pattern.name}
                description={pattern.description}
                preview={
                  <span
                    className={`prototype-pattern ${pattern.previewClassName} block size-full`}
                  />
                }
                onChange={() =>
                  dispatch({
                    type: "setPatternId",
                    patternId: pattern.id,
                  })
                }
              />
            );
          })}
        </div>
      </fieldset>
    </section>
  );
}
