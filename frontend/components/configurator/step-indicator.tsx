import type { ComponentPropsWithoutRef } from "react";

import { classNames } from "../ui/class-names";

export interface StepIndicatorStep {
  id: string;
  label: string;
}

export interface StepIndicatorProps
  extends Omit<ComponentPropsWithoutRef<"nav">, "aria-label"> {
  "aria-label"?: string;
  currentStepId?: string;
  emptyMessage?: string;
  steps: readonly StepIndicatorStep[];
}

export function StepIndicator({
  "aria-label": ariaLabel = "Configuration progress",
  className,
  currentStepId,
  emptyMessage = "No configuration steps are available.",
  steps,
  ...navProps
}: StepIndicatorProps) {
  const stepIds = new Set(steps.map((step) => step.id));
  if (stepIds.size !== steps.length) {
    throw new RangeError("StepIndicator step IDs must be unique.");
  }

  const currentStepIndex =
    currentStepId === undefined
      ? -1
      : steps.findIndex((step) => step.id === currentStepId);

  if (currentStepId !== undefined && currentStepIndex === -1) {
    throw new RangeError(
      `StepIndicator could not find current step "${currentStepId}".`,
    );
  }

  return (
    <nav
      {...navProps}
      aria-label={ariaLabel}
      className={classNames("min-w-0", className)}
    >
      {steps.length === 0 ? (
        <p className="text-supporting text-text-muted">{emptyMessage}</p>
      ) : (
        <ol className="flex min-w-0 flex-col gap-3 sm:flex-row">
          {steps.map((step, index) => {
            const isCurrent = index === currentStepIndex;
            const isCompleted =
              currentStepIndex !== -1 && index < currentStepIndex;
            const statusLabel = isCompleted
              ? "Complete"
              : isCurrent
                ? "Current"
                : "Upcoming";

            return (
              <li
                key={step.id}
                aria-current={isCurrent ? "step" : undefined}
                className={classNames(
                  "flex min-w-0 flex-1 items-center gap-3 rounded-card border bg-surface px-control-x py-3 shadow-card",
                  isCurrent
                    ? "border-brand"
                    : isCompleted
                      ? "border-border-strong"
                      : "border-border",
                )}
              >
                <span
                  aria-hidden="true"
                  className={classNames(
                    "flex size-8 shrink-0 items-center justify-center rounded-pill border text-label font-control",
                    isCurrent
                      ? "border-brand bg-brand text-on-brand"
                      : isCompleted
                        ? "border-brand bg-surface text-brand"
                        : "border-border-strong bg-surface-subtle text-text-muted",
                  )}
                >
                  {isCompleted ? "✓" : index + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={classNames(
                      "block text-label font-control tracking-label",
                      isCurrent ? "text-brand" : "text-text-primary",
                    )}
                  >
                    {step.label}
                  </span>
                  <span className="block text-supporting text-text-muted">
                    {statusLabel}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );
}
