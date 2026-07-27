"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";
import {
  hasValidMeasurementsForShape,
  useConfiguration,
} from "@/context/configuration";
import {
  patternCatalogue,
  type PatternCatalogueResult,
} from "@/data/patterns";

import { MeasurementStep } from "./measurement-step";
import { PatternStep } from "./pattern-step";
import { PreviewStep } from "./preview-step";
import {
  ReviewEntry,
  ReviewScreen,
  ReviewUnavailable,
} from "./review-step";
import {
  deriveReviewReadiness,
  type ReviewSection,
} from "./review-summary";
import { ShapeSelectionStep } from "./shape-selection-step";
import {
  StepIndicator,
  type StepIndicatorStep,
} from "./step-indicator";

const configuratorSteps = [
  { id: "shape", label: "Shape" },
  { id: "measurements", label: "Measurements" },
  { id: "pattern", label: "Pattern" },
  { id: "preview", label: "Preview" },
  { id: "review", label: "Review" },
] as const satisfies readonly StepIndicatorStep[];

const editTargetIds = {
  measurements: "configuration-measurements-edit-target",
  pattern: "configuration-pattern-edit-target",
  patternScale: "configuration-pattern-scale-edit-target",
  shape: "configuration-shape-edit-target",
} as const satisfies Readonly<Record<ReviewSection, string>>;

function focusEditTarget(targetId: string) {
  const target = document.getElementById(targetId);

  if (target === null) {
    return;
  }

  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "start" });
}

export interface ConfiguratorProps {
  catalogueResult?: PatternCatalogueResult;
}

export function Configurator({
  catalogueResult = patternCatalogue,
}: ConfiguratorProps = {}) {
  const { state } = useConfiguration();
  const [activeView, setActiveView] =
    useState<"configure" | "review">("configure");
  const [reviewHasBeenOpened, setReviewHasBeenOpened] =
    useState(false);
  const pendingFocusTarget = useRef<string | null>(null);
  const measurementsAreValid = hasValidMeasurementsForShape(
    state.shape,
    state.width,
    state.height,
    state.thickness,
    state.unit,
  );
  const reviewReadiness = deriveReviewReadiness(
    state,
    catalogueResult,
  );
  const patternIsSelected =
    catalogueResult.status === "ready" &&
    state.patternId !== null &&
    catalogueResult.patterns.some(
      (pattern) => pattern.id === state.patternId,
    );
  const reviewIsVisible =
    activeView === "review" && reviewReadiness.status === "ready";
  const currentStepId =
    reviewIsVisible
      ? "review"
      : measurementsAreValid && patternIsSelected
      ? "preview"
      : measurementsAreValid
        ? "pattern"
        : state.shape !== null
          ? "measurements"
          : "shape";

  useLayoutEffect(() => {
    if (pendingFocusTarget.current === null) {
      return;
    }

    focusEditTarget(pendingFocusTarget.current);
    pendingFocusTarget.current = null;
  }, [activeView]);

  const showReview = () => {
    if (reviewReadiness.status !== "ready") {
      return;
    }

    pendingFocusTarget.current = "configuration-review-heading";
    setReviewHasBeenOpened(true);
    setActiveView("review");
  };

  const editSection = (section: ReviewSection) => {
    const targetId = editTargetIds[section];

    if (reviewIsVisible) {
      pendingFocusTarget.current = targetId;
      setActiveView("configure");
      return;
    }

    focusEditTarget(targetId);
  };

  return (
    <>
      <StepIndicator
        className="configurator-progress print-hidden mt-layout"
        currentStepId={currentStepId}
        steps={configuratorSteps}
      />

      <div
        className="configurator-editing print-hidden"
        hidden={reviewIsVisible}
      >
        {reviewHasBeenOpened ? (
          <section
            aria-label="Return to configuration review"
            className="sticky top-3 z-10 mt-component flex min-w-0 flex-col gap-3 rounded-card border border-border-strong bg-surface p-control-x py-3 shadow-raised sm:flex-row sm:items-center sm:justify-between"
          >
            <p
              id="configuration-return-review-status"
              className="min-w-0 break-words text-supporting text-text-muted"
            >
              {reviewReadiness.status === "ready"
                ? "Your changes are reflected in the current summary."
                : "Review output is unavailable until the incomplete items below are resolved."}
            </p>
            <Button
              className="shrink-0"
              variant="secondary"
              disabled={reviewReadiness.status !== "ready"}
              aria-describedby="configuration-return-review-status"
              onClick={showReview}
            >
              Return to review
            </Button>
          </section>
        ) : null}

        <section aria-label="Shape selection" className="mt-layout">
          <ShapeSelectionStep focusTargetId={editTargetIds.shape} />
        </section>

        <MeasurementStep
          focusTargetId={editTargetIds.measurements}
        />
        <PatternStep
          catalogueResult={catalogueResult}
          focusTargetId={editTargetIds.pattern}
        />
        <PreviewStep
          focusTargetId={editTargetIds.patternScale}
        />

        {reviewReadiness.status === "ready" ? (
          <ReviewEntry onReview={showReview} />
        ) : (
          <ReviewUnavailable
            canEditPattern={measurementsAreValid}
            readiness={reviewReadiness}
            onEdit={editSection}
          />
        )}
      </div>

      {reviewIsVisible && reviewReadiness.status === "ready" ? (
        <ReviewScreen
          readiness={reviewReadiness}
          onEdit={editSection}
        />
      ) : null}
    </>
  );
}
