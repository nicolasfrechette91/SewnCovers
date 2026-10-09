import type { ComponentPropsWithRef, ReactNode } from "react";

import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./button-styles";
import { classNames } from "./class-names";
import { LoadingSpinner } from "./loading-spinner";

export type { ButtonSize, ButtonVariant } from "./button-styles";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  isLoading?: boolean;
  loadingLabel?: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

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
      className={buttonClasses({ className, size, variant })}
    >
      <span
        aria-hidden={isLoading || undefined}
        className={classNames(
          "inline-flex min-w-0 wrap-anywhere items-center justify-center gap-icon",
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
