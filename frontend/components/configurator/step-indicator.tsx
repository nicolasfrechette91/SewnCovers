import type { ComponentPropsWithoutRef } from "react";

import { classNames } from "../ui/class-names";

export interface StepIndicatorStep {
  id: string;
  label: string;
}

export interface StepIndicatorProps
  extends Omit<ComponentPropsWithoutRef<"nav">, "aria-label"> {
  "aria-label"?: string;
  completedStepIds?: readonly string[];
  currentStepId?: string;
  emptyMessage?: string;
  onStepSelect?: (stepId: string) => void;
  revisitableStepIds?: readonly string[];
  steps: readonly StepIndicatorStep[];
}

export function StepIndicator({
  "aria-label": ariaLabel = "Configuration progress",
  className,
  completedStepIds = [],
  currentStepId,
  emptyMessage = "No configuration steps are available.",
  onStepSelect,
  revisitableStepIds = [],
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

  for (const stepId of [...completedStepIds, ...revisitableStepIds]) {
    if (!stepIds.has(stepId)) {
      throw new RangeError(
        `StepIndicator could not find referenced step "${stepId}".`,
      );
    }
  }

  const completedIds = new Set(completedStepIds);
  const revisitableIds = new Set(revisitableStepIds);

  return (
    <nav
      {...navProps}
      aria-label={ariaLabel}
      className={classNames("min-w-0", className)}
    >
      {steps.length === 0 ? (
        <p className="text-supporting text-text-muted">{emptyMessage}</p>
      ) : (
        <>
          <p className="mb-3 text-supporting font-control text-text-muted">
            Stage {currentStepIndex + 1} of {steps.length}
          </p>
          <ol className="grid min-w-0 grid-cols-1 gap-2 min-[350px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {steps.map((step, index) => {
              const isCurrent = index === currentStepIndex;
              const isCompleted = completedIds.has(step.id);
              const isRevisitable =
                !isCurrent &&
                revisitableIds.has(step.id) &&
                onStepSelect !== undefined;
              const statusLabel = isCompleted
                ? "Complete"
                : isCurrent
                  ? "Current"
                  : "Upcoming";
              const content = (
                <>
                  <span
                    aria-hidden="true"
                    className={classNames(
                      "flex size-7 shrink-0 items-center justify-center rounded-pill border text-label font-control",
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
                        "block break-words text-label font-control tracking-label",
                        isCurrent ? "text-brand" : "text-text-primary",
                      )}
                    >
                      {step.label}
                    </span>
                    <span className="block text-supporting text-text-muted">
                      {statusLabel}
                    </span>
                  </span>
                </>
              );

              return (
                <li
                  key={step.id}
                  aria-current={isCurrent ? "step" : undefined}
                  className={classNames(
                    "flex min-h-20 min-w-0 items-stretch rounded-card border bg-surface shadow-card",
                    isCurrent
                      ? "border-brand"
                      : isCompleted
                        ? "border-border-strong"
                        : "border-border",
                  )}
                >
                  {isRevisitable ? (
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-card px-3 py-2 text-left transition-colors hover:bg-surface-subtle motion-reduce:transition-none"
                      aria-label={`Return to ${step.label}, completed stage ${index + 1} of ${steps.length}`}
                      onClick={() => onStepSelect(step.id)}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </nav>
  );
}
