"use client";

import {
  useId,
  type ComponentPropsWithRef,
  type ReactNode,
} from "react";

import { classNames } from "../ui/class-names";

export interface PatternFilterOption<Value extends string = string> {
  disabled?: boolean;
  label: ReactNode;
  value: Value;
}

interface PatternFilterBaseProps<Value extends string>
  extends Omit<ComponentPropsWithRef<"fieldset">, "onChange"> {
  emptyMessage?: ReactNode;
  legend: ReactNode;
  name: string;
  options: readonly PatternFilterOption<Value>[];
}

interface SinglePatternFilterProps<Value extends string>
  extends PatternFilterBaseProps<Value> {
  onChange: (value: Value) => void;
  selectionMode?: "single";
  value?: Value;
}

interface MultiplePatternFilterProps<Value extends string>
  extends PatternFilterBaseProps<Value> {
  onChange: (values: Value[]) => void;
  selectionMode: "multiple";
  value: readonly Value[];
}

export type PatternFilterProps<Value extends string = string> =
  | SinglePatternFilterProps<Value>
  | MultiplePatternFilterProps<Value>;

export function PatternFilter<Value extends string = string>(
  props: PatternFilterProps<Value>,
) {
  const {
    className,
    disabled = false,
    emptyMessage = "No filter options are available.",
    legend,
    name,
    onChange,
    options,
    ref,
    selectionMode = "single",
    value,
    ...fieldsetProps
  } = props;
  const generatedId = useId();
  const isMultiple = selectionMode === "multiple";
  const selectedValues: readonly Value[] = isMultiple
    ? (value as readonly Value[])
    : value === undefined
      ? []
      : [value as Value];

  const selectOption = (option: Value) => {
    if (!isMultiple) {
      (onChange as (value: Value) => void)(option);
      return;
    }

    const nextSelectedValues = new Set(selectedValues);

    if (nextSelectedValues.has(option)) {
      nextSelectedValues.delete(option);
    } else {
      nextSelectedValues.add(option);
    }

    (onChange as (values: Value[]) => void)(
      Array.from(nextSelectedValues),
    );
  };

  const optionValues = new Set(options.map((option) => option.value));
  if (optionValues.size !== options.length) {
    throw new RangeError("PatternFilter option values must be unique.");
  }

  return (
    <fieldset
      {...fieldsetProps}
      ref={ref}
      disabled={disabled}
      className={classNames("min-w-0", className)}
    >
      <legend className="mb-3 text-label font-control tracking-label text-text-primary">
        {legend}
      </legend>
      {options.length === 0 ? (
        <p className="text-supporting text-text-muted">{emptyMessage}</p>
      ) : (
        <div className="flex min-w-0 flex-wrap gap-2">
          {options.map((option) => {
            const optionId = `pattern-filter-${generatedId}-${encodeURIComponent(option.value)}`;
            const isChecked = selectedValues.includes(option.value);

            return (
              <span key={option.value} className="relative min-w-0">
                <input
                  className="pattern-filter-input peer sr-only"
                  id={optionId}
                  type={isMultiple ? "checkbox" : "radio"}
                  name={name}
                  value={option.value}
                  disabled={option.disabled}
                  checked={isChecked}
                  onChange={() => selectOption(option.value)}
                />
                <label
                  htmlFor={optionId}
                  className="pattern-filter-label flex min-h-11 max-w-full cursor-pointer items-center gap-icon rounded-pill border border-border-strong bg-surface px-control-x py-2 text-label font-control text-text-primary shadow-card transition-[background-color,border-color,color,box-shadow,opacity] hover:bg-surface-subtle active:shadow-none peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand peer-checked:hover:bg-brand-hover peer-disabled:cursor-not-allowed peer-disabled:border-control-disabled-border peer-disabled:bg-control-disabled-surface peer-disabled:text-control-disabled-text peer-disabled:opacity-75 motion-reduce:transition-none"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-4 shrink-0 items-center justify-center rounded-control-small border border-current text-supporting leading-none"
                  >
                    {isChecked ? "✓" : ""}
                  </span>
                  <span className="min-w-0 break-words">{option.label}</span>
                </label>
              </span>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
