import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { classNames } from "./class-names";

export interface ErrorMessageProps
  extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  children: ReactNode;
  /** Optional visible heading shown above the message. */
  heading?: ReactNode;
}

export function ErrorMessage({
  "aria-live": ariaLive = "assertive",
  children,
  className,
  heading,
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
        "flex min-w-0 wrap-anywhere items-start gap-3 rounded-card border border-error-border bg-error-surface px-control-x py-3 text-supporting text-error-text",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill border-[1.5px] border-current font-mono text-label font-control"
      >
        !
      </span>
      <div className="min-w-0">
        {heading ? <p className="font-control">{heading}</p> : null}
        {heading ? <div className="mt-1">{children}</div> : children}
      </div>
    </div>
  );
}
