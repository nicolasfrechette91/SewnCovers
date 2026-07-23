import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { classNames } from "./class-names";

export interface ErrorMessageProps
  extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  children: ReactNode;
}

export function ErrorMessage({
  "aria-live": ariaLive = "assertive",
  children,
  className,
  role = "alert",
  ...alertProps
}: ErrorMessageProps) {
  return (
    <div
      {...alertProps}
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
      className={classNames(
        "flex items-start gap-icon rounded-control border border-error-border bg-error-surface px-control-x py-3 text-supporting text-error-text",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill border border-current text-label font-control"
      >
        !
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
