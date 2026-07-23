import type { ComponentPropsWithRef, ReactNode } from "react";

import { classNames } from "./class-names";
import { LoadingSpinner } from "./loading-spinner";

export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "default" | "compact";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  isLoading?: boolean;
  loadingLabel?: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-brand bg-brand text-on-brand shadow-raised enabled:hover:border-brand-hover enabled:hover:bg-brand-hover enabled:active:border-brand-active enabled:active:bg-brand-active",
  secondary:
    "border-border-strong bg-surface text-text-primary shadow-card enabled:hover:bg-surface-subtle enabled:active:bg-surface-subtle enabled:active:text-brand-active enabled:active:shadow-none",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "min-h-12 px-control-x py-control-y",
  compact: "min-h-10 px-3 py-2",
};

export function Button({
  "aria-busy": ariaBusy,
  children,
  className,
  disabled = false,
  isLoading = false,
  loadingLabel = "Loading…",
  ref,
  size = "default",
  type = "button",
  variant = "primary",
  ...buttonProps
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading ? true : ariaBusy}
      className={classNames(
        "relative inline-flex items-center justify-center gap-icon rounded-control border text-button font-control tracking-label transition-[background-color,border-color,color,box-shadow] motion-reduce:transition-none disabled:cursor-not-allowed disabled:border-control-disabled-border disabled:bg-control-disabled-surface disabled:text-control-disabled-text disabled:shadow-none",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
    >
      <span
        aria-hidden={isLoading || undefined}
        className={classNames(
          "inline-flex items-center justify-center gap-icon",
          isLoading && "invisible",
        )}
      >
        {children}
      </span>
      {isLoading ? (
        <span className="absolute inset-0 flex items-center justify-center gap-icon px-control-x">
          <LoadingSpinner size={size} />
          <span>{loadingLabel}</span>
        </span>
      ) : null}
    </button>
  );
}
