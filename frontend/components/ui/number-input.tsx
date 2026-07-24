"use client";

import { useId, type ComponentPropsWithRef, type ReactNode } from "react";

import { classNames } from "./class-names";

export interface NumberInputProps
  extends Omit<ComponentPropsWithRef<"input">, "type"> {
  containerClassName?: string;
  invalid?: boolean;
  label: ReactNode;
  supportingText?: ReactNode;
  type?: "number" | "text";
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
      <label
        htmlFor={inputId}
        className="text-label font-control tracking-label text-text-primary"
      >
        {label}
      </label>
      <input
        {...inputProps}
        ref={ref}
        id={inputId}
        type={type}
        inputMode={inputMode}
        aria-describedby={describedBy || undefined}
        aria-invalid={invalid ? true : ariaInvalid}
        className={classNames(
          "min-h-12 min-w-0 rounded-control border border-border-strong bg-surface px-control-x py-control-y text-body text-text-primary transition-[background-color,border-color,box-shadow] placeholder:text-text-muted motion-reduce:transition-none disabled:cursor-not-allowed disabled:border-control-disabled-border disabled:bg-control-disabled-surface disabled:text-control-disabled-text aria-invalid:border-error-border aria-invalid:bg-error-surface",
          className,
        )}
      />
      {supportingText ? (
        <p id={supportingTextId} className="text-supporting text-text-muted">
          {supportingText}
        </p>
      ) : null}
    </div>
  );
}
