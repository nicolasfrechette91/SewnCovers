"use client";

import { useId } from "react";

import {
  useConfiguration,
  type ClosureType,
  type FitPreference,
  type MaterialId,
  type SeamStyle,
} from "@/context/configuration";
import {
  closureOptions,
  fitOptions,
  materialOptions,
  seamOptions,
} from "@/data/cover-options";

interface OptionGroupProps<Id extends string> {
  readonly description: string;
  readonly legend: string;
  readonly name: string;
  readonly onChange: (id: Id) => void;
  readonly options: readonly {
    readonly description: string;
    readonly id: Id;
    readonly name: string;
  }[];
  readonly value: Id;
}

function OptionGroup<Id extends string>({
  description,
  legend,
  name,
  onChange,
  options,
  value,
}: OptionGroupProps<Id>) {
  const generatedId = useId();
  const descriptionId = `${generatedId}-description`;

  return (
    <fieldset
      aria-describedby={descriptionId}
      className="min-w-0 py-component first:pt-0 last:pb-0"
    >
      <legend className="text-subhead font-control text-text-primary">
        {legend}
      </legend>
      <p id={descriptionId} className="mt-1 text-supporting text-text-muted">
        {description}
      </p>
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {options.map((option) => {
          const optionId = `${generatedId}-${option.id}`;
          const optionTitleId = `${optionId}-title`;
          const optionDescriptionId = `${optionId}-description`;

          return (
            <label
              key={option.id}
              htmlFor={optionId}
              className="cover-option-label choice-card flex min-h-28 min-w-0 gap-3 p-4"
            >
              <input
                id={optionId}
                className="cover-option-input mt-0.5 size-5 shrink-0 cursor-pointer accent-brand"
                type="radio"
                name={name}
                value={option.id}
                checked={value === option.id}
                aria-labelledby={optionTitleId}
                aria-describedby={optionDescriptionId}
                onChange={() => onChange(option.id)}
              />
              <span className="min-w-0">
                <span
                  id={optionTitleId}
                  className="block break-words text-body font-control text-text-primary"
                >
                  {option.name}
                </span>
                <span
                  id={optionDescriptionId}
                  className="mt-1 block text-supporting text-text-muted"
                >
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CoverDetailsStep({
  focusTargetId,
}: Readonly<{ focusTargetId?: string }>) {
  const { dispatch, state } = useConfiguration();

  if (state.shape === null) {
    return null;
  }

  return (
    <section
      aria-labelledby={focusTargetId}
      className="min-w-0 rounded-panel border border-border bg-surface p-card shadow-hairline"
    >
      <h1
        id={focusTargetId}
        tabIndex={focusTargetId ? -1 : undefined}
        className="configurator-edit-target scroll-mt-layout font-display text-section-title font-heading tracking-heading text-text-primary"
      >
        Choose cover details
      </h1>
      <p className="mt-2 max-w-3xl text-body text-text-muted">
        Choose the fabric, fit, opening and edge. You&apos;ll pick a colour or
        pattern next.
      </p>

      <div className="mt-component flex min-w-0 flex-col divide-y divide-dashed divide-border-strong">
        <OptionGroup<MaterialId>
          legend="Material"
          description="The cloth your cover is made from."
          name="cover-material"
          options={materialOptions}
          value={state.materialId}
          onChange={(materialId) =>
            dispatch({ type: "setMaterialId", materialId })
          }
        />
        <OptionGroup<FitPreference>
          legend="Fit"
          description="How snugly the cover sits on the cushion."
          name="cover-fit"
          options={fitOptions}
          value={state.fitPreference}
          onChange={(fitPreference) =>
            dispatch({ type: "setFitPreference", fitPreference })
          }
        />
        <OptionGroup<ClosureType>
          legend="Opening"
          description="How the cover comes off for washing."
          name="cover-closure"
          options={closureOptions}
          value={state.closureType}
          onChange={(closureType) =>
            dispatch({ type: "setClosureType", closureType })
          }
        />
        <OptionGroup<SeamStyle>
          legend="Edge finish"
          description="How the edges of the cover look."
          name="cover-seam"
          options={seamOptions}
          value={state.seamStyle}
          onChange={(seamStyle) =>
            dispatch({ type: "setSeamStyle", seamStyle })
          }
        />
      </div>
    </section>
  );
}
