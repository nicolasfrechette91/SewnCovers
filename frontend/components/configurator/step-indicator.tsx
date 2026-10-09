import type { ComponentPropsWithoutRef, CSSProperties } from "react";

import { classNames } from "../ui/class-names";

export interface StepIndicatorStep {
  id: string;
  label: string;
}

export interface StepIndicatorProps extends Omit<
  ComponentPropsWithoutRef<"div">,
  "aria-label" | "role"
> {
  "aria-label"?: string;
  completedStepIds?: readonly string[];
  currentStepId?: string;
  emptyMessage?: string;
  onStepSelect?: (stepId: string) => void;
  revisitableStepIds?: readonly string[];
  steps: readonly StepIndicatorStep[];
}

type ProgressTrackStyle = CSSProperties & {
  "--progress": number;
  "--track-inset": string;
};

/**
 * Stage progress drawn as a tape measure: numbered ticks on a ruler line that
 * fills with brand colour up to the current stage. Labels show from md up and
 * status words from lg up; both stay in each item for assistive technology.
 * The stages are buttons that change what the page shows, not links to other
 * pages, so the container is a labelled group rather than a navigation
 * landmark.
 */
export function StepIndicator({
  "aria-label": ariaLabel = "Configuration progress",
  className,
  completedStepIds = [],
  currentStepId,
  emptyMessage = "No configuration steps are available.",
  onStepSelect,
  revisitableStepIds = [],
  steps,
  ...groupProps
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
  const trackStyle: ProgressTrackStyle = {
    "--progress":
      steps.length > 1 ? Math.max(currentStepIndex, 0) / (steps.length - 1) : 0,
    "--track-inset": `${50 / Math.max(steps.length, 1)}%`,
    gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, minmax(0, 1fr))`,
  };

  return (
    <div
      {...groupProps}
      role="group"
      aria-label={ariaLabel}
      className={classNames("min-w-0", className)}
    >
      {steps.length === 0 ? (
        <p className="text-supporting text-text-muted">{emptyMessage}</p>
      ) : (
        <>
          <p className="mb-4 font-mono text-eyebrow uppercase tracking-eyebrow text-text-muted">
            Stage {currentStepIndex + 1} of {steps.length}
          </p>
          <ol className="progress-track grid min-w-0 gap-1" style={trackStyle}>
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
                      "flex size-11 shrink-0 items-center justify-center rounded-pill border-[1.5px] font-mono text-label transition-[background-color,border-color,color,box-shadow] duration-(--duration-base) motion-reduce:transition-none",
                      isCurrent
                        ? "border-brand bg-brand text-on-brand shadow-current"
                        : isCompleted
                          ? "border-brand bg-surface text-brand"
                          : "border-dashed border-border-strong bg-surface-subtle text-text-muted",
                    )}
                  >
                    {isCompleted ? "✓" : index + 1}
                  </span>
                  <span className="min-w-0 max-w-full">
                    <span
                      className={classNames(
                        "sr-only md:not-sr-only md:block md:break-words md:text-label md:tracking-label",
                        isCurrent
                          ? "md:font-control md:text-brand"
                          : "md:font-emphasis md:text-text-primary",
                      )}
                    >
                      {step.label}
                    </span>
                    <span className="sr-only lg:not-sr-only lg:mt-0.5 lg:block lg:font-mono lg:text-eyebrow lg:uppercase lg:tracking-eyebrow lg:text-text-muted">
                      {statusLabel}
                    </span>
                  </span>
                </>
              );

              return (
                <li
                  key={step.id}
                  aria-current={isCurrent ? "step" : undefined}
                  className="relative z-1 flex min-w-0 justify-center text-center"
                >
                  {isRevisitable ? (
                    <button
                      type="button"
                      className="group flex min-w-0 max-w-full flex-col items-center gap-2 rounded-card px-1 pb-1 transition-colors duration-(--duration-fast) hover:[&>span:first-child]:bg-brand-tint motion-reduce:transition-none"
                      aria-label={`${step.label} ${statusLabel.toLowerCase()}, stage ${index + 1} of ${steps.length}`}
                      onClick={() => onStepSelect(step.id)}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex min-w-0 max-w-full flex-col items-center gap-2 px-1 pb-1">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
