"use client";

import dynamic from "next/dynamic";
import { useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";
import {
  getBuiltInPatternId,
  hasValidMeasurementsForShape,
  useConfiguration,
} from "@/context/configuration";
import { getPatternById } from "@/data/patterns";
import { getCompleteCatalogueResult } from "@/services/pattern-catalogue";
import { usePatternCatalogue } from "@/services/use-pattern-catalogue";

import type { SelectedPatternPresentation } from "./preview-step";
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
import { WorkspaceConfigurationLoader } from "./workspace-configuration-loader";

function StageLoading() {
  return (
    <p className="mt-layout text-supporting text-text-muted" role="status">
      Loading this configuration stage…
    </p>
  );
}

const MeasurementStep = dynamic(
  () => import("./measurement-step").then((loaded) => loaded.MeasurementStep),
  { loading: StageLoading },
);
const CoverDetailsStep = dynamic(
  () => import("./cover-details-step").then((loaded) => loaded.CoverDetailsStep),
  { loading: StageLoading },
);
const PatternStep = dynamic(
  () => import("./pattern-step").then((loaded) => loaded.PatternStep),
  { loading: StageLoading },
);
const PreviewStep = dynamic(
  () => import("./preview-step").then((loaded) => loaded.PreviewStep),
  { loading: StageLoading },
);
const ReviewScreen = dynamic(
  () => import("./review-step").then((loaded) => loaded.ReviewScreen),
  { loading: StageLoading },
);

const configuratorSteps = [
  { id: "shape", label: "Shape" },
  { id: "measurements", label: "Measurements" },
  { id: "details", label: "Cover details" },
  { id: "pattern", label: "Pattern" },
  { id: "preview", label: "Preview" },
  { id: "review", label: "Review" },
] as const satisfies readonly StepIndicatorStep[];

type ConfiguratorStepId = (typeof configuratorSteps)[number]["id"];

const focusTargetIds = {
  details: "configuration-cover-details-edit-target",
  measurements: "configuration-measurements-edit-target",
  pattern: "configuration-pattern-edit-target",
  preview: "configuration-pattern-scale-edit-target",
  review: "configuration-review-heading",
  shape: "configuration-shape-edit-target",
} as const satisfies Readonly<Record<ConfiguratorStepId, string>>;

const reviewSectionSteps = {
  coverDetails: "details",
  measurements: "measurements",
  pattern: "pattern",
  patternScale: "preview",
  shape: "shape",
} as const satisfies Readonly<Record<ReviewSection, ConfiguratorStepId>>;

function getStepIndex(stepId: ConfiguratorStepId): number {
  return configuratorSteps.findIndex((step) => step.id === stepId);
}

function focusStage(targetId: string): boolean {
  const target = document.getElementById(targetId);

  if (target === null) {
    return false;
  }

  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "start", behavior: "auto" });
  return true;
}

export function Configurator() {
  const { state } = useConfiguration();
  const {
    retry: retryPatternCatalogue,
    setFilters: setPatternFilters,
    state: patternCatalogue,
  } = usePatternCatalogue();
  const [requestedStepId, setRequestedStepId] =
    useState<ConfiguratorStepId>("shape");
  const [highestStepReached, setHighestStepReached] = useState(0);
  const [stageAnnouncement, setStageAnnouncement] = useState("");
  const pendingFocusTarget = useRef<string | null>(null);
  const measurementsAreValid = hasValidMeasurementsForShape(
    state.shape,
    state.width,
    state.height,
    state.thickness,
    state.unit,
    state.backWidth,
  );
  const catalogueResult = getCompleteCatalogueResult(patternCatalogue);
  const selectedBuiltInPattern = getPatternById(
    patternCatalogue.allPatterns,
    getBuiltInPatternId(state.pattern),
  );
  const selectedPattern: SelectedPatternPresentation | null =
    state.pattern?.kind === "custom"
      ? state.pattern.previewUrl && !state.pattern.unavailableReason
        ? {
            name: state.pattern.label,
            previewClassName: "",
            previewUrl: state.pattern.previewUrl,
          }
        : null
      : selectedBuiltInPattern;
  const reviewReadiness = deriveReviewReadiness(state, catalogueResult);
  const patternIssue =
    reviewReadiness.status === "incomplete"
      ? reviewReadiness.issues.find((issue) => issue.section === "pattern")
      : undefined;
  const patternCanContinue = patternIssue === undefined;

  let dataAllowsThroughStep = 0;
  if (state.shape !== null) {
    dataAllowsThroughStep = measurementsAreValid ? 3 : 1;
  }
  if (measurementsAreValid && patternCanContinue) {
    dataAllowsThroughStep =
      reviewReadiness.status === "ready" ? 5 : 4;
  }

  const maximumAccessibleStep = Math.min(
    highestStepReached,
    dataAllowsThroughStep,
  );
  const requestedStepIndex = getStepIndex(requestedStepId);
  const activeStepIndex = Math.min(
    requestedStepIndex,
    maximumAccessibleStep,
  );
  const activeStep = configuratorSteps[activeStepIndex];
  const activeStepId = activeStep.id;
  const lastStepIndex = configuratorSteps.length - 1;
  const stepDataIsCompatible = [
    state.shape !== null,
    measurementsAreValid,
    measurementsAreValid,
    measurementsAreValid && patternCanContinue,
    reviewReadiness.status === "ready",
    reviewReadiness.status === "ready",
  ] as const;
  const completedStepIds = configuratorSteps
    .filter((step, index) => {
      const wasCompleted =
        index < highestStepReached ||
        (highestStepReached === lastStepIndex && index === lastStepIndex);

      return (
        step.id !== activeStepId &&
        wasCompleted &&
        stepDataIsCompatible[index] &&
        index <= dataAllowsThroughStep
      );
    })
    .map((step) => step.id);

  useLayoutEffect(() => {
    let frame: number | undefined;
    const focusPendingStage = () => {
      const targetId = pendingFocusTarget.current;
      if (targetId === null) return;
      if (focusStage(targetId)) {
        pendingFocusTarget.current = null;
        return;
      }
      frame = requestAnimationFrame(focusPendingStage);
    };
    focusPendingStage();
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [activeStepId]);

  const navigateToStep = (stepId: ConfiguratorStepId) => {
    const stepIndex = getStepIndex(stepId);
    if (stepIndex > maximumAccessibleStep) {
      return;
    }

    pendingFocusTarget.current = focusTargetIds[stepId];
    setRequestedStepId(stepId);
    setStageAnnouncement(
      `Stage ${stepIndex + 1} of ${configuratorSteps.length}: ${configuratorSteps[stepIndex].label}.`,
    );
  };

  const continueToNextStep = () => {
    if (activeStepIndex >= lastStepIndex) {
      return;
    }

    const nextStepIndex = activeStepIndex + 1;
    const nextStep = configuratorSteps[nextStepIndex];
    pendingFocusTarget.current = focusTargetIds[nextStep.id];
    setHighestStepReached((current) =>
      Math.max(current, nextStepIndex),
    );
    setRequestedStepId(nextStep.id);
    setStageAnnouncement(
      `Stage ${nextStepIndex + 1} of ${configuratorSteps.length}: ${nextStep.label}.`,
    );
  };

  const returnToPreviousStep = () => {
    if (activeStepIndex === 0) {
      return;
    }

    navigateToStep(configuratorSteps[activeStepIndex - 1].id);
  };

  const editSection = (section: ReviewSection) => {
    navigateToStep(reviewSectionSteps[section]);
  };

  const canContinue =
    activeStepId === "shape"
      ? state.shape !== null
      : activeStepId === "measurements"
        ? measurementsAreValid
        : activeStepId === "pattern"
          ? patternCanContinue
          : activeStepId === "preview"
            ? reviewReadiness.status === "ready"
            : true;
  const continueHelp =
    activeStepId === "shape" && state.shape === null
      ? "Choose a cushion shape to continue."
      : activeStepId === "measurements" && !measurementsAreValid
        ? "Enter every required measurement within the displayed range to continue."
        : activeStepId === "pattern" && patternIssue !== undefined
          ? patternIssue.message
          : activeStepId === "preview" && reviewReadiness.status === "incomplete"
            ? reviewReadiness.issues[0]?.message ??
              "Complete the preview choices to continue."
            : "Your current choices will be preserved and remain editable.";
  const previousStep =
    activeStepIndex > 0
      ? configuratorSteps[activeStepIndex - 1]
      : null;
  const nextStep =
    activeStepIndex < lastStepIndex
      ? configuratorSteps[activeStepIndex + 1]
      : null;
  const stageActions = (
    <nav
      aria-label={`${activeStep.label} stage actions`}
      className="print-hidden mt-component min-w-0 rounded-card border border-border-strong bg-surface p-control-x py-4 shadow-card"
    >
      {nextStep !== null ? (
        <p
          id="configuration-stage-action-help"
          className="break-words text-supporting text-text-muted"
        >
          {continueHelp}
        </p>
      ) : null}
      <div className="mt-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between">
        {previousStep !== null ? (
          <Button variant="secondary" onClick={returnToPreviousStep}>
            Back to {previousStep.label}
          </Button>
        ) : (
          <span aria-hidden="true" />
        )}
        {nextStep !== null ? (
          <Button
            disabled={!canContinue}
            aria-describedby="configuration-stage-action-help"
            onClick={continueToNextStep}
          >
            Continue to {nextStep.label}
          </Button>
        ) : null}
      </div>
    </nav>
  );

  let activeStageContent;
  if (activeStepId === "shape") {
    activeStageContent = (
      <section aria-label="Shape selection" className="mt-layout">
        <ShapeSelectionStep focusTargetId={focusTargetIds.shape} />
      </section>
    );
  } else if (activeStepId === "measurements") {
    activeStageContent = (
      <MeasurementStep focusTargetId={focusTargetIds.measurements} />
    );
  } else if (activeStepId === "details") {
    activeStageContent = (
      <CoverDetailsStep focusTargetId={focusTargetIds.details} />
    );
  } else if (activeStepId === "pattern") {
    activeStageContent = (
      <PatternStep
        catalogue={patternCatalogue}
        focusTargetId={focusTargetIds.pattern}
        onFiltersChange={setPatternFilters}
        onRetry={retryPatternCatalogue}
      />
    );
  } else if (activeStepId === "preview") {
    activeStageContent = (
      <PreviewStep
        onEdit={navigateToStep}
        focusTargetId={focusTargetIds.preview}
        selectedPattern={selectedPattern}
      />
    );
  } else {
    activeStageContent =
      reviewReadiness.status === "ready" && selectedPattern !== null ? (
        <ReviewScreen
          configuration={state}
          readiness={reviewReadiness}
          selectedPattern={selectedPattern}
          onEdit={editSection}
        />
      ) : null;
  }

  return (
    <>
      <StepIndicator
        className="configurator-progress print-hidden mt-layout"
        completedStepIds={completedStepIds}
        currentStepId={activeStepId}
        revisitableStepIds={completedStepIds}
        steps={configuratorSteps}
        onStepSelect={(stepId) =>
          navigateToStep(stepId as ConfiguratorStepId)
        }
      />

      <SharedDesignLoader
        catalogue={catalogueResult}
        onRetryPatterns={retryPatternCatalogue}
      />
      <WorkspaceConfigurationLoader />

      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {stageAnnouncement}
      </p>

      <div className="configurator-active-stage min-w-0">
        {activeStepId === "review" ? stageActions : null}
        {activeStageContent}
        {activeStepId !== "review" ? stageActions : null}
      </div>
    </>
  );
}
