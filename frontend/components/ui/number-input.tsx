"use client";

import { useId, type ComponentPropsWithRef, type ReactNode } from "react";

import { classNames } from "./class-names";
import { controlClasses, fieldHelpClasses, fieldLabelClasses } from "./field-styles";

export interface NumberInputProps
  extends Omit<ComponentPropsWithRef<"input">, "type"> {
  containerClassName?: string;
  invalid?: boolean;
  label: ReactNode;
  supportingText?: ReactNode;
  type?: "number" | "text";
  /** Visual unit suffix inside the field, e.g. "cm". The label should still
   * name the unit; the suffix is hidden from assistive technology. */
  unit?: ReactNode;
}

export function NumberInput({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  className,
  containerClassName,
  id,
  inputMode = "decimal",
  invalid = false,
  label,
  ref,
  supportingText,
  type = "number",
  unit,
  ...inputProps
}: NumberInputProps) {
  const generatedId = useId();
  const inputId = id ?? `number-input-${generatedId}`;
  const supportingTextId = supportingText ? `${inputId}-description` : undefined;
  const describedBy = [ariaDescribedBy, supportingTextId]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames("flex min-w-0 flex-col gap-2", containerClassName)}>
      <label htmlFor={inputId} className={fieldLabelClasses}>
        {label}
      </label>
      <div className="relative min-w-0">
        <input
          {...inputProps}
          ref={ref}
          id={inputId}
          type={type}
          inputMode={inputMode}
          aria-describedby={describedBy || undefined}
          aria-invalid={invalid ? true : ariaInvalid}
          className={classNames(
            controlClasses,
            "font-mono tabular-nums",
            unit ? "pr-14" : null,
            className,
          )}
        />
        {unit ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 flex items-center border-l border-dashed border-border-strong px-3 font-mono text-supporting text-text-muted"
          >
            {unit}
          </span>
        ) : null}
      </div>
      {supportingText ? (
        <p id={supportingTextId} className={fieldHelpClasses}>
          {supportingText}
        </p>
      ) : null}
    </div>
  );
}
