"use client";

import dynamic from "next/dynamic";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui";
import {
  getBuiltInPatternId,
  hasValidMeasurementsForShape,
  isInitialConfiguration,
  useConfiguration,
} from "@/context/configuration";
import { getPatternById } from "@/data/patterns";
import {
  clearDraft,
  clearPendingAccountAction,
  readDraft,
  storableConfiguration,
  takeAuthReturnHint,
  writeDraft,
} from "@/services/configurator-draft";
import { getCompleteCatalogueResult } from "@/services/pattern-catalogue";
import { usePatternCatalogue } from "@/services/use-pattern-catalogue";

import { CurrentSelections } from "./current-selections";
import type { SelectedPatternPresentation } from "./preview-step";
import { deriveReviewReadiness } from "./review-summary";
import { ShapeSelectionStep } from "./shape-selection-step";
import { SharedDesignLoader } from "./shared-design-loader";
import { StepIndicator, type StepIndicatorStep } from "./step-indicator";
import { WorkspaceConfigurationLoader } from "./workspace-configuration-loader";

function StageLoading() {
  return (
    <p
      className="flex min-h-40 items-center justify-center rounded-panel border border-dashed border-border-strong bg-surface px-card py-layout text-supporting text-text-muted"
      role="status"
    >
      Loading this configuration stage…
    </p>
  );
}

const MeasurementStep = dynamic(
  () => import("./measurement-step").then((loaded) => loaded.MeasurementStep),
  { loading: StageLoading },
);
const CoverDetailsStep = dynamic(
  () =>
    import("./cover-details-step").then((loaded) => loaded.CoverDetailsStep),
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
// The Pattern stage's live preview in the side column; the stage chunk
// already carries the cushion model, so this stays out of the first load.
const FabricPreview = dynamic(() =>
  import("./fabric-preview").then((loaded) => loaded.FabricPreview),
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

// After a client-side navigation Next.js settles focus in its own layout
// effect, and lazily loaded stages mount a little later; wait for both.
function focusWhenReady(targetId: string, attempts = 120): void {
  requestAnimationFrame(() => {
    if (!focusStage(targetId) && attempts > 0) {
      focusWhenReady(targetId, attempts - 1);
    }
  });
}

// Restoring and protecting the browser draft lives outside the initial chunk.
// It is requested as soon as this module loads, so arrival rarely waits.
type DraftSession = typeof import("./draft-session");
const loadDraftSession = () => import("./draft-session");
const draftSessionRequest =
  typeof window === "undefined" ? null : loadDraftSession();

type DraftGate =
  | { readonly status: "checking" }
  | {
      readonly status: "confirm";
      readonly reason: import("./draft-session").ReplaceReason;
    }
  | { readonly status: "link" }
  | { readonly status: "ready"; readonly restored: boolean };

export interface ConfiguratorProps {
  /** The page's own title, which each stage's tab title extends. */
  documentTitle?: string;
  /** The page introduction, shown on the first stage only. */
  intro?: ReactNode;
}

export function Configurator({ documentTitle, intro }: ConfiguratorProps = {}) {
  const { dispatch, state } = useConfiguration();
  const {
    retry: retryPatternCatalogue,
    setFilters: setPatternFilters,
    state: patternCatalogue,
  } = usePatternCatalogue();
  const [requestedStepId, setRequestedStepId] =
    useState<ConfiguratorStepId>("shape");
  const [highestStepReached, setHighestStepReached] = useState(0);
  const [stageAnnouncement, setStageAnnouncement] = useState("");
  const [gate, setGate] = useState<DraftGate>({ status: "checking" });
  const [session, setSession] = useState<DraftSession | null>(null);
  const pendingFocusTarget = useRef<string | null>(null);
  const latestState = useRef(state);
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
      : state.pattern?.kind === "solid"
        ? {
            name: "Solid colour",
            previewClassName: "",
            solidColor: state.pattern.color,
          }
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
    dataAllowsThroughStep = reviewReadiness.status === "ready" ? 5 : 4;
  }

  const maximumAccessibleStep = Math.min(
    highestStepReached,
    dataAllowsThroughStep,
  );
  const requestedStepIndex = getStepIndex(requestedStepId);
  const activeStepIndex = Math.min(requestedStepIndex, maximumAccessibleStep);
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

  const announceStage = (prefix: string, stepId: ConfiguratorStepId) => {
    const stepIndex = getStepIndex(stepId);
    setStageAnnouncement(
      `${prefix} Stage ${stepIndex + 1} of ${configuratorSteps.length}: ${configuratorSteps[stepIndex].label}.`,
    );
  };

  useEffect(() => {
    latestState.current = state;
  }, [state]);

  // The heading changes with the stage, so the tab title names it too. Next
  // can write the page's metadata title after this runs (after hydration, or
  // when a navigation lands here), so the stage title is re-applied when the
  // head changes. It only ever edits the page's own <title>, never adds one,
  // and stops after a few attempts so it cannot fight the router. As a layout
  // effect, the observer disconnects in the commit that leaves the page.
  useLayoutEffect(() => {
    if (!documentTitle) return;
    const title = `${activeStep.label} (stage ${activeStepIndex + 1} of ${configuratorSteps.length}) – ${documentTitle}`;
    let attempts = 10;
    const applyTitle = () => {
      if (attempts === 0 || document.querySelector("title") === null) return;
      if (document.title !== title) {
        attempts -= 1;
        document.title = title;
      }
    };
    applyTitle();
    const observer = new MutationObserver(applyTitle);
    observer.observe(document.head, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [activeStep.label, activeStepIndex, documentTitle]);

  // Brings back the design kept in this browser, at the stage it was left on.
  // Returns the stage, or null when there is nothing worth restoring.
  const restoreStoredDesign = (
    loaded: DraftSession,
  ): ConfiguratorStepId | null => {
    const stored = loaded.readStoredDesign(readDraft());
    if (!stored) return null;
    dispatch({ type: "restoreDraft", configuration: stored.configuration });
    setRequestedStepId(stored.step);
    setHighestStepReached(stored.highestStep);
    return stored.step;
  };

  // On arrival a shared or project link takes precedence, unless it would
  // overwrite an unsaved design: then the visitor chooses. Otherwise the
  // stored draft comes back at the stage it was left on.
  const arrive = (loaded: DraftSession) => {
    const plan = loaded.planArrival(
      window.location.search,
      readDraft(),
      latestState.current,
    );
    if (plan.kind === "link") {
      setGate({ status: "link" });
      return;
    }
    if (plan.kind === "confirm") {
      setGate({ status: "confirm", reason: plan.reason });
      return;
    }
    const stepId = plan.kind === "restore" ? restoreStoredDesign(loaded) : null;
    const returningFromSignIn = takeAuthReturnHint("configure");
    setGate({ status: "ready", restored: stepId !== null });
    if (stepId !== null) {
      announceStage(
        returningFromSignIn
          ? "Signed in. Your design is as you left it."
          : "Picked up where you left off.",
        stepId,
      );
    } else if (returningFromSignIn) {
      setStageAnnouncement("Signed in.");
    }
    if (returningFromSignIn) focusWhenReady(focusTargetIds[stepId ?? "shape"]);
  };

  useEffect(() => {
    let active = true;
    void (draftSessionRequest ?? loadDraftSession()).then((loaded) => {
      if (!active) return;
      setSession(loaded);
      arrive(loaded);
    });
    return () => {
      active = false;
    };
    // Runs once on arrival; later changes come from the stage actions.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keeps the design and stage in this browser. Nothing is written until
  // something has been chosen, or while a replace decision is pending.
  useEffect(() => {
    if (gate.status === "checking" || gate.status === "confirm") return;
    if (isInitialConfiguration(state) && activeStepIndex === 0) return;
    writeDraft({
      configuration: storableConfiguration(state),
      step: activeStepId,
      highestStep: highestStepReached,
    });
  }, [activeStepId, activeStepIndex, gate.status, highestStepReached, state]);

  // Keeps the stored design: after a link would have replaced it, or after
  // the visitor started a new one before it loaded.
  const keepStoredDesign = () => {
    if (!session) return;
    session.removeLinkParameters();
    const stepId = restoreStoredDesign(session);
    setGate({ status: "ready", restored: stepId !== null });
    announceStage("Your design was kept.", stepId ?? "shape");
    focusWhenReady(focusTargetIds[stepId ?? "shape"]);
  };

  const replaceStoredDesign = () => {
    if (gate.status !== "confirm") return;
    if (gate.reason === "started") {
      setGate({ status: "ready", restored: false });
      focusWhenReady(focusTargetIds[activeStepId]);
      return;
    }
    setGate({ status: "link" });
    focusWhenReady(
      gate.reason === "design"
        ? "shared-design-status-heading"
        : "workspace-load-heading",
    );
  };

  // "Continue with my configuration" after a link fails: bring back the
  // stored design if nothing else has been chosen since. The panel with the
  // pressed button closes, so focus moves on to the stage heading.
  const restoreAfterDismissedLink = () => {
    let stepId: ConfiguratorStepId = activeStepId;
    if (session && isInitialConfiguration(state)) {
      const restoredStepId = restoreStoredDesign(session);
      if (restoredStepId !== null) {
        setGate({ status: "ready", restored: true });
        stepId = restoredStepId;
      }
    }
    focusWhenReady(focusTargetIds[stepId]);
  };

  const startNewDesign = () => {
    clearDraft();
    clearPendingAccountAction();
    dispatch({ type: "resetConfiguration" });
    setRequestedStepId("shape");
    setHighestStepReached(0);
    setGate({ status: "ready", restored: false });
    announceStage("Started a new design.", "shape");
    focusWhenReady(focusTargetIds.shape);
  };

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
    setHighestStepReached((current) => Math.max(current, nextStepIndex));
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
  // Said only when something blocks Continue.
  const continueHelp =
    activeStepId === "shape" && state.shape === null
      ? "Choose a cushion shape to continue."
      : activeStepId === "measurements" && !measurementsAreValid
        ? "Enter each measurement within the range shown to continue."
        : activeStepId === "pattern" && patternIssue !== undefined
          ? patternIssue.message
          : activeStepId === "preview" &&
              reviewReadiness.status === "incomplete"
            ? (reviewReadiness.issues[0]?.message ??
              "Complete the preview choices to continue.")
            : "";
  const previousStep =
    activeStepIndex > 0 ? configuratorSteps[activeStepIndex - 1] : null;
  const nextStep =
    activeStepIndex < lastStepIndex
      ? configuratorSteps[activeStepIndex + 1]
      : null;
  const stageActions = (
    <div
      role="group"
      aria-label={`${activeStep.label} stage actions`}
      className={
        activeStepId === "review"
          ? "print-hidden min-w-0"
          : "print-hidden mt-component min-w-0"
      }
    >
      {activeStepId !== "review" ? (
        <span aria-hidden="true" className="stitch-rule block" />
      ) : null}
      {nextStep !== null ? (
        <p
          id="configuration-stage-action-help"
          className={
            continueHelp === ""
              ? "sr-only"
              : "mt-4 break-words text-supporting font-emphasis text-accent-strong"
          }
        >
          {continueHelp}
        </p>
      ) : null}
      <div className="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between">
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
            aria-describedby={
              continueHelp === ""
                ? undefined
                : "configuration-stage-action-help"
            }
            onClick={continueToNextStep}
          >
            Continue to {nextStep.label}
          </Button>
        ) : null}
      </div>
    </div>
  );

  let activeStageContent;
  if (activeStepId === "shape") {
    activeStageContent = (
      <section aria-label="Shape selection">
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
        selectedFabric={selectedPattern}
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
        />
      ) : null;
  }

  const showSelections =
    activeStepId === "measurements" ||
    activeStepId === "details" ||
    activeStepId === "pattern";

  return (
    <>
      {/* The page introduction belongs to the first stage only; from stage 2
          the stage heading is the page's h1. The panels below it keep their
          h2 on stage 1 and become plain titles after, so no h2 precedes it. */}
      {activeStepId === "shape" ? intro : null}
      <StepIndicator
        className="configurator-progress print-hidden"
        completedStepIds={completedStepIds}
        currentStepId={activeStepId}
        revisitableStepIds={completedStepIds}
        steps={configuratorSteps}
        onStepSelect={(stepId) => navigateToStep(stepId as ConfiguratorStepId)}
      />

      {session && gate.status === "confirm" ? (
        <session.DraftReplaceConfirmation
          asHeading={activeStepId === "shape"}
          reason={gate.reason}
          onKeep={keepStoredDesign}
          onReplace={replaceStoredDesign}
        />
      ) : null}

      {gate.status === "link" || gate.status === "ready" ? (
        <>
          <SharedDesignLoader
            asHeading={activeStepId === "shape"}
            catalogue={catalogueResult}
            onDismiss={restoreAfterDismissedLink}
            onRestored={session?.recordLinkRestore}
            onRetryPatterns={retryPatternCatalogue}
          />
          <WorkspaceConfigurationLoader
            asHeading={activeStepId === "shape"}
            onDismiss={restoreAfterDismissedLink}
            onRestored={session?.recordLinkRestore}
          />
        </>
      ) : null}

      {session && gate.status === "ready" && gate.restored ? (
        <session.DraftRestoredNotice onStartOver={startNewDesign} />
      ) : null}

      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {stageAnnouncement}
      </p>

      <div
        className={
          showSelections
            ? "mt-layout grid min-w-0 gap-component lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-layout"
            : "mt-layout min-w-0"
        }
      >
        {showSelections ? (
          <div className="min-w-0 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1">
            <CurrentSelections
              fabricName={selectedPattern?.name ?? null}
              fabricSolidColor={selectedPattern?.solidColor ?? null}
              stage={activeStepId}
            />
            {/* Below lg the Pattern stage shows its own copy under its intro. */}
            {activeStepId === "pattern" && state.shape !== null ? (
              <FabricPreview
                className="mt-4 hidden lg:block"
                fabric={selectedPattern}
              />
            ) : null}
          </div>
        ) : null}
        <div className="configurator-active-stage min-w-0 lg:col-start-1 lg:row-start-1">
          {activeStepId === "review" ? stageActions : null}
          <div key={activeStepId} className="stage-enter min-w-0">
            {activeStageContent}
          </div>
          {activeStepId !== "review" ? stageActions : null}
        </div>
      </div>
    </>
  );
}
