import type {
  ChangeEventHandler,
  FormEventHandler,
  ReactNode,
  Ref,
} from "react";

import { classNames } from "../ui/class-names";

export interface PatternCardProps {
  "aria-describedby"?: string;
  checked?: boolean;
  className?: string;
  defaultChecked?: boolean;
  description?: ReactNode;
  disabled?: boolean;
  form?: string;
  id: string;
  name: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  onInvalid?: FormEventHandler<HTMLInputElement>;
  patternCategory?: ReactNode;
  patternName: ReactNode;
  preview?: ReactNode;
  previewDecorative?: boolean;
  ref?: Ref<HTMLInputElement>;
  required?: boolean;
  value: string;
}

export function PatternCard({
  "aria-describedby": ariaDescribedBy,
  checked,
  className,
  defaultChecked,
  description,
  disabled = false,
  form,
  id,
  name,
  onChange,
  onInvalid,
  patternCategory,
  patternName,
  preview,
  previewDecorative = true,
  ref,
  required,
  value,
}: PatternCardProps) {
  const nameId = `${id}-name`;
  const categoryId = patternCategory ? `${id}-category` : undefined;
  const descriptionId = description ? `${id}-description` : undefined;
  const describedBy = [ariaDescribedBy, categoryId, descriptionId]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames("relative min-w-0", className)}>
      <input
        ref={ref}
        className="pattern-card-input peer sr-only"
        id={id}
        type="radio"
        name={name}
        value={value}
        form={form}
        required={required}
        disabled={disabled}
        checked={checked}
        defaultChecked={defaultChecked}
        aria-labelledby={nameId}
        aria-describedby={describedBy || undefined}
        onChange={onChange}
        onInvalid={onInvalid}
      />
      <label
        htmlFor={id}
        className="pattern-card-label flex min-h-44 min-w-0 cursor-pointer flex-col overflow-hidden rounded-card border border-border-strong bg-surface shadow-card transition-[background-color,border-color,box-shadow,opacity] hover:bg-surface-subtle active:shadow-none peer-checked:border-brand peer-disabled:cursor-not-allowed peer-disabled:border-control-disabled-border peer-disabled:bg-control-disabled-surface peer-disabled:text-control-disabled-text peer-disabled:opacity-75 motion-reduce:transition-none"
      >
        <span className="relative flex aspect-[4/3] min-h-24 items-center justify-center overflow-hidden border-b border-border bg-surface-subtle p-control-x">
          <span
            aria-hidden={previewDecorative || undefined}
            className="flex size-full min-w-0 items-center justify-center overflow-hidden"
          >
            {preview ?? (
              <span
                aria-hidden="true"
                className="block h-3/5 w-4/5 rounded-panel border border-border-strong bg-surface shadow-card"
              />
            )}
          </span>
          <span
            aria-hidden="true"
            className="pattern-card-selected-marker absolute top-3 right-3 hidden items-center gap-1 rounded-pill bg-brand px-2 py-1 text-supporting font-control text-on-brand shadow-card"
          >
            <span>✓</span>
            <span>Selected</span>
          </span>
        </span>
        <span className="flex min-w-0 flex-1 items-start gap-3 p-control-x">
          <span
            aria-hidden="true"
            className="pattern-card-control-indicator mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill border border-border-strong bg-surface text-supporting text-transparent"
          >
            ✓
          </span>
          <span className="min-w-0 flex-1">
            <span
              id={nameId}
              className="block break-words text-body font-control text-text-primary"
            >
              {patternName}
            </span>
            {patternCategory ? (
              <span
                id={categoryId}
                className="mt-1 block break-words text-label font-emphasis text-accent-strong"
              >
                {patternCategory}
              </span>
            ) : null}
            {description ? (
              <span
                id={descriptionId}
                className="mt-1 block break-words text-supporting text-text-muted"
              >
                {description}
              </span>
            ) : null}
          </span>
        </span>
      </label>
    </div>
  );
}
