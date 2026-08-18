"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";
import {
  hasValidMeasurementsForShape,
  useConfiguration,
} from "@/context/configuration";
import { getPatternById } from "@/data/patterns";
import { getCompleteCatalogueResult } from "@/services/pattern-catalogue";
import { usePatternCatalogue } from "@/services/use-pattern-catalogue";

import { MeasurementStep } from "./measurement-step";
import { CoverDetailsStep } from "./cover-details-step";
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
import { SharedDesignLoader } from "./shared-design-loader";
import {
  StepIndicator,
  type StepIndicatorStep,
} from "./step-indicator";

const configuratorSteps = [
  { id: "shape", label: "Shape" },
  { id: "measurements", label: "Measurements" },
  { id: "details", label: "Cover details" },
  { id: "pattern", label: "Pattern" },
  { id: "preview", label: "Preview" },
  { id: "review", label: "Review" },
] as const satisfies readonly StepIndicatorStep[];

const editTargetIds = {
  measurements: "configuration-measurements-edit-target",
  coverDetails: "configuration-cover-details-edit-target",
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

export function Configurator() {
  const { state } = useConfiguration();
  const {
    retry: retryPatternCatalogue,
    setFilters: setPatternFilters,
    state: patternCatalogue,
  } = usePatternCatalogue();
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
    state.backWidth,
  );
  const catalogueResult =
    getCompleteCatalogueResult(patternCatalogue);
  const selectedPattern = getPatternById(
    patternCatalogue.allPatterns,
    state.patternId,
  );
  const reviewReadiness = deriveReviewReadiness(
    state,
    catalogueResult,
  );
  const patternIsSelected = selectedPattern !== null;
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

      <SharedDesignLoader
        catalogue={catalogueResult}
        onRetryPatterns={retryPatternCatalogue}
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
        <CoverDetailsStep
          focusTargetId={editTargetIds.coverDetails}
        />
        <PatternStep
          catalogue={patternCatalogue}
          focusTargetId={editTargetIds.pattern}
          onFiltersChange={setPatternFilters}
          onRetry={retryPatternCatalogue}
        />
        <PreviewStep
          focusTargetId={editTargetIds.patternScale}
          selectedPattern={selectedPattern}
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

      {reviewIsVisible &&
      reviewReadiness.status === "ready" &&
      selectedPattern !== null ? (
        <ReviewScreen
          configuration={state}
          readiness={reviewReadiness}
          selectedPattern={selectedPattern}
          onEdit={editSection}
        />
      ) : null}
    </>
  );
}
