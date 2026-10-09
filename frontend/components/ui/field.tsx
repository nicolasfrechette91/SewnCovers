"use client";

import { useId, type ComponentPropsWithRef, type ReactNode } from "react";

import { classNames } from "./class-names";
import {
  checkboxClasses,
  controlClasses,
  fieldErrorClasses,
  fieldHelpClasses,
  fieldLabelClasses,
} from "./field-styles";

export function TextInput({
  className,
  ...props
}: ComponentPropsWithRef<"input">) {
  return <input {...props} className={classNames(controlClasses, className)} />;
}

export function Select({
  className,
  ...props
}: ComponentPropsWithRef<"select">) {
  return (
    <select
      {...props}
      className={classNames(controlClasses, "cursor-pointer pr-10", className)}
    />
  );
}

export function Textarea({
  className,
  ...props
}: ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      {...props}
      className={classNames(controlClasses, "leading-relaxed", className)}
    />
  );
}

export interface CheckboxProps extends Omit<
  ComponentPropsWithRef<"input">,
  "type"
> {
  label: ReactNode;
  labelClassName?: string;
}

export function Checkbox({
  className,
  id,
  label,
  labelClassName,
  ...props
}: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id ?? `checkbox-${generatedId}`;

  return (
    <div className={classNames("flex min-w-0 items-start gap-3", className)}>
      <input
        {...props}
        id={checkboxId}
        type="checkbox"
        className={checkboxClasses}
      />
      <label
        htmlFor={checkboxId}
        className={classNames(
          "min-w-0 cursor-pointer text-supporting text-text-primary",
          labelClassName,
        )}
      >
        {label}
      </label>
    </div>
  );
}

export interface FieldControlProps {
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  id: string;
}

export interface FieldProps {
  children: (control: FieldControlProps) => ReactNode;
  className?: string;
  error?: ReactNode;
  help?: ReactNode;
  id?: string;
  label: ReactNode;
}

/** Label, control, help and error text, with ids wired for assistive tech. */
export function Field({
  children,
  className,
  error,
  help,
  id,
  label,
}: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? `field-${generatedId}`;
  const helpId = help ? `${controlId}-help` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ");

  return (
    <div className={classNames("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={controlId} className={fieldLabelClasses}>
        {label}
      </label>
      {children({
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : undefined,
        id: controlId,
      })}
      {help ? (
        <p id={helpId} className={fieldHelpClasses}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={fieldErrorClasses}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
