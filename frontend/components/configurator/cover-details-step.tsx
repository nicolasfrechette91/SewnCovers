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
    <fieldset aria-describedby={descriptionId} className="min-w-0">
      <legend className="text-body font-control text-text-primary">
        {legend}
      </legend>
      <p id={descriptionId} className="mt-1 text-supporting text-text-muted">
        {description}
      </p>
      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {options.map((option) => {
          const optionId = `${generatedId}-${option.id}`;
          const optionTitleId = `${optionId}-title`;
          const optionDescriptionId = `${optionId}-description`;

          return (
            <label
              key={option.id}
              htmlFor={optionId}
              className="cover-option-label flex min-h-28 min-w-0 cursor-pointer gap-3 rounded-card border-2 border-border-strong bg-surface p-control-x py-3 shadow-card transition-[background-color,border-color,box-shadow] hover:bg-surface-subtle motion-reduce:transition-none"
            >
              <input
                id={optionId}
                className="cover-option-input mt-1 size-5 shrink-0 accent-brand"
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
                  className="block text-body font-control text-text-primary"
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
      className="mt-layout min-w-0 rounded-panel border border-border bg-surface p-card shadow-raised"
    >
      <h2
        id={focusTargetId}
        tabIndex={focusTargetId ? -1 : undefined}
        className="configurator-edit-target scroll-mt-layout font-display text-section-title font-heading tracking-heading text-text-primary"
      >
        Choose cover details
      </h2>
      <p className="mt-2 max-w-3xl text-body text-text-muted">
        Material is separate from the visual pattern. These choices describe
        your planning preference only; they do not confirm stock, pricing, or
        manufacturing performance.
      </p>

      <div className="mt-layout grid min-w-0 gap-layout">
        <OptionGroup<MaterialId>
          legend="Material direction"
          description="Choose the base fabric character; pattern and motif size come later."
          name="cover-material"
          options={materialOptions}
          value={state.materialId}
          onChange={(materialId) =>
            dispatch({ type: "setMaterialId", materialId })
          }
        />
        <OptionGroup<FitPreference>
          legend="Fit preference"
          description="This changes only the communicated visual preference and never rewrites your measurements."
          name="cover-fit"
          options={fitOptions}
          value={state.fitPreference}
          onChange={(fitPreference) =>
            dispatch({ type: "setFitPreference", fitPreference })
          }
        />
        <div className="grid min-w-0 gap-layout xl:grid-cols-2">
          <OptionGroup<ClosureType>
            legend="Closure and access"
            description="Choose how you would prefer to access the cushion inside."
            name="cover-closure"
            options={closureOptions}
            value={state.closureType}
            onChange={(closureType) =>
              dispatch({ type: "setClosureType", closureType })
            }
          />
          <OptionGroup<SeamStyle>
            legend="Edge finish"
            description="Choose the visible seam treatment around the main face."
            name="cover-seam"
            options={seamOptions}
            value={state.seamStyle}
            onChange={(seamStyle) =>
              dispatch({ type: "setSeamStyle", seamStyle })
            }
          />
        </div>
      </div>
    </section>
  );
}
