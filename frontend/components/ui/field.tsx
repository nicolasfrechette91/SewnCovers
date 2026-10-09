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
  /** Shown under the label and wired into aria-describedby. */
  error?: ReactNode;
  help?: ReactNode;
  label: ReactNode;
  labelClassName?: string;
}

/**
 * The label wraps the box, so the whole row is one 44px target and the box is
 * named by its text. Help and error text sit under the row, outside the label.
 */
export function Checkbox({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  className,
  error,
  help,
  id,
  label,
  labelClassName,
  ...props
}: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id ?? `checkbox-${generatedId}`;
  const helpId = help ? `${checkboxId}-help` : undefined;
  const errorId = error ? `${checkboxId}-error` : undefined;
  const describedBy = [ariaDescribedBy, helpId, errorId]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames("min-w-0", className)}>
      <label
        className={classNames(
          "flex min-h-11 min-w-0 cursor-pointer items-start gap-2 text-supporting text-text-primary",
          labelClassName,
        )}
      >
        <input
          {...props}
          id={checkboxId}
          type="checkbox"
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : ariaInvalid}
          className={checkboxClasses}
        />
        <span className="min-w-0">{label}</span>
      </label>
      {help ? (
        <p id={helpId} className={classNames("mt-2", fieldHelpClasses)}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={classNames("mt-2", fieldErrorClasses)}>
          {error}
        </p>
      ) : null}
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
  /** Extra ids appended to aria-describedby, for text outside the field. */
  describedBy?: string;
  error?: ReactNode;
  /** "alert" announces the error the moment it appears. */
  errorRole?: "alert";
  help?: ReactNode;
  /** Keeps the label for assistive technology and hides it visually. */
  hideLabel?: boolean;
  id?: string;
  label: ReactNode;
}

/** Label, control, help and error text, with ids wired for assistive tech. */
export function Field({
  children,
  className,
  describedBy: extraDescribedBy,
  error,
  errorRole,
  help,
  hideLabel = false,
  id,
  label,
}: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? `field-${generatedId}`;
  const helpId = help ? `${controlId}-help` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [helpId, errorId, extraDescribedBy]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames("flex min-w-0 flex-col gap-2", className)}>
      <label
        htmlFor={controlId}
        className={hideLabel ? "sr-only" : fieldLabelClasses}
      >
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
        <p id={errorId} role={errorRole} className={fieldErrorClasses}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
