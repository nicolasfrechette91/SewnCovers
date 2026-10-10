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
  patternColors?: ReactNode;
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
  patternColors,
  patternName,
  preview,
  previewDecorative = true,
  ref,
  required,
  value,
}: PatternCardProps) {
  const nameId = `${id}-name`;
  const categoryId = patternCategory ? `${id}-category` : undefined;
  const colorsId = patternColors ? `${id}-colors` : undefined;
  const descriptionId = description ? `${id}-description` : undefined;
  const describedBy = [ariaDescribedBy, categoryId, colorsId, descriptionId]
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
        className="pattern-card-label choice-card flex min-h-32 min-w-0 flex-row overflow-hidden peer-disabled:opacity-75 min-[360px]:flex-col sm:min-h-44"
      >
        {/* Two cards per row on phones, so the swatch is shorter there. */}
        <span className="relative flex w-2/5 shrink-0 items-center justify-center overflow-hidden bg-surface-subtle p-3 min-[360px]:aspect-[3/2] min-[360px]:w-auto min-[360px]:pb-5 min-[360px]:pinked-edge sm:aspect-[4/3] sm:min-h-24 sm:p-control-x">
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
            className="pattern-card-selected-marker absolute top-2 left-2 hidden items-center gap-1 rounded-control-small bg-brand px-2 py-1 font-mono text-eyebrow uppercase tracking-eyebrow text-on-brand shadow-card sm:top-3 sm:right-3 sm:left-auto"
          >
            <span>✓</span>
            <span>Selected</span>
          </span>
        </span>
        <span className="flex min-w-0 flex-1 items-start gap-3 p-3 sm:px-4 sm:pt-3 sm:pb-4">
          <span
            aria-hidden="true"
            className="pattern-card-control-indicator choice-indicator mt-nudge"
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
                className="mt-1 block break-words font-mono text-eyebrow uppercase tracking-eyebrow text-accent-strong"
              >
                {patternCategory}
              </span>
            ) : null}
            {/* Phones keep the colours for screen readers; the swatch shows them. */}
            {patternColors ? (
              <span
                id={colorsId}
                className="sr-only mt-1 break-words text-supporting text-text-muted sm:not-sr-only sm:block"
              >
                Colours: {patternColors}
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
