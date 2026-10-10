import type { ReactNode } from "react";

import { classNames } from "./class-names";

/**
 * An allow-list rather than the full set of div attributes: `title`, for one,
 * is a valid attribute that would turn a mistyped `heading` into a tooltip.
 * Any prop outside this list is a type error.
 */
export interface ErrorMessageProps {
  "aria-live"?: "assertive" | "polite";
  children: ReactNode;
  className?: string;
  /** Optional visible heading shown above the message. */
  heading?: ReactNode;
  /** The element for the heading: a real heading when it belongs in the outline. */
  headingAs?: "p" | "h2" | "h3" | "h4";
  id?: string;
  role?: "alert" | "status";
}

export function ErrorMessage({
  "aria-live": ariaLive = "assertive",
  children,
  className,
  heading,
  headingAs: Heading = "p",
  id,
  role = "alert",
}: ErrorMessageProps) {
  return (
    <div
      id={id}
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
        className="mt-nudge flex size-5 shrink-0 items-center justify-center rounded-pill border-[1.5px] border-current font-mono text-label font-control"
      >
        !
      </span>
      <div className="min-w-0">
        {heading ? <Heading className="font-control">{heading}</Heading> : null}
        {heading ? <div className="mt-1">{children}</div> : children}
      </div>
    </div>
  );
}
