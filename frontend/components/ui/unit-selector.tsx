"use client";

import { useId, type ComponentPropsWithRef, type ReactNode } from "react";

import { classNames } from "./class-names";

const unitOptions = [
  { label: "Centimetres", shortLabel: "cm", value: "cm" },
  { label: "Inches", shortLabel: "in", value: "in" },
] as const;

export type MeasurementUnit = (typeof unitOptions)[number]["value"];

export interface UnitSelectorProps
  extends Omit<ComponentPropsWithRef<"fieldset">, "onChange"> {
  legend?: ReactNode;
  name: string;
  onChange: (unit: MeasurementUnit) => void;
  required?: boolean;
  value: MeasurementUnit;
}

export function UnitSelector({
  className,
  disabled = false,
  legend = "Measurement unit",
  name,
  onChange,
  ref,
  required = false,
  value,
  ...fieldsetProps
}: UnitSelectorProps) {
  const generatedId = useId();

  return (
    <fieldset
      {...fieldsetProps}
      ref={ref}
      disabled={disabled}
      className={classNames("min-w-0", className)}
    >
      <legend className="mb-2 text-label font-control tracking-label text-text-primary">
        {legend}
      </legend>
      <div className="grid grid-cols-2 rounded-control border border-border-strong bg-surface p-1">
        {unitOptions.map((option) => {
          const optionId = `unit-selector-${generatedId}-${option.value}`;

          return (
            <div key={option.value} className="relative min-w-0">
              <input
                className="unit-selector-input peer sr-only"
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                required={required}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
              />
              <label
                htmlFor={optionId}
                className="unit-selector-label flex min-h-11 cursor-pointer items-center justify-center gap-icon rounded-control-small px-3 py-2 text-center text-button font-control text-text-primary transition-[background-color,color,box-shadow] hover:bg-surface-subtle active:bg-surface-subtle active:text-brand-active peer-checked:bg-brand peer-checked:text-on-brand peer-checked:hover:bg-brand-hover peer-checked:active:bg-brand-active peer-checked:active:text-on-brand peer-disabled:cursor-not-allowed peer-disabled:bg-control-disabled-surface peer-disabled:text-control-disabled-text motion-reduce:transition-none"
              >
                <span
                  aria-hidden="true"
                  className={classNames(
                    "transition-opacity motion-reduce:transition-none",
                    value === option.value ? "opacity-100" : "opacity-0",
                  )}
                >
                  ✓
                </span>
                <span>
                  {option.label} ({option.shortLabel})
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
