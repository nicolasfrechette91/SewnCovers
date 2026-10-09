import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { classNames } from "./class-names";
import { LoadingSpinner } from "./loading-spinner";

export interface LoadingStateProps extends Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> {
  /** A dashed frame around the spinner, for a panel that is still filling. */
  framed?: boolean;
  label?: ReactNode;
}

export function LoadingState({
  "aria-live": ariaLive = "polite",
  className,
  framed = false,
  label = "Loading…",
  role = "status",
  ...statusProps
}: LoadingStateProps) {
  return (
    <div
      {...statusProps}
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
      className={classNames(
        framed
          ? "flex rounded-card border border-dashed border-border-strong bg-surface p-card"
          : "inline-flex",
        "items-center gap-icon text-supporting text-text-muted",
        className,
      )}
    >
      <LoadingSpinner className="text-brand" />
      <span>{label}</span>
    </div>
  );
}
