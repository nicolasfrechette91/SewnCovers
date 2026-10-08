import { Button, noticeClasses, noticeTitleClasses } from "@/components/ui";
import type { ConfigurationState } from "@/context/configuration";
import { getCushionShapeDefinition } from "@/data/shapes";
import type { SelectedPatternPresentation } from "./preview-step";

import { ConfigurationSummary } from "./configuration-summary";
import { PreviewStep } from "./preview-step";
import { PrivateProjectPanel } from "./private-project-panel";
import {
  type ReviewReadiness,
  type ReviewSection,
} from "./review-summary";
import { SaveSharePanel } from "./save-share-panel";
import { SummaryOutputActions } from "./summary-output-actions";

const editActionLabels = {
  coverDetails: "Edit cover details",
  measurements: "Edit measurements",
  pattern: "Edit pattern",
  patternScale: "Edit pattern scale",
  shape: "Edit shape",
} as const satisfies Readonly<Record<ReviewSection, string>>;

const editActionOrder: readonly ReviewSection[] = [
  "shape",
  "measurements",
  "coverDetails",
  "pattern",
  "patternScale",
];

interface ReviewUnavailableProps {
  canEditPattern: boolean;
  onEdit: (section: ReviewSection) => void;
  readiness: Extract<ReviewReadiness, { status: "incomplete" }>;
}

export function ReviewUnavailable({
  canEditPattern,
  onEdit,
  readiness,
}: ReviewUnavailableProps) {
  const affectedSections = editActionOrder.filter((section) =>
    readiness.issues.some((issue) => issue.section === section),
  );
  const patternEditBlocked =
    affectedSections.includes("pattern") && !canEditPattern;

  return (
    <section
      aria-labelledby="configuration-review-unavailable-heading"
      aria-live="polite"
      aria-atomic="true"
      className="mt-layout min-w-0 rounded-panel border border-border-strong bg-surface p-card shadow-raised"
    >
      <p className="text-label font-control tracking-label text-accent-strong">
        Review
      </p>
      <h2
        id="configuration-review-unavailable-heading"
        className="mt-2 break-words font-display text-section-title font-heading tracking-heading text-text-primary"
      >
        Complete the configuration before review
      </h2>
      <p className="mt-3 max-w-3xl break-words text-body text-text-muted">
        Printing and downloading stay unavailable until every item below is
        complete and the selected pattern can be verified.
      </p>
      <ul className="mt-component list-disc space-y-2 pl-5 text-body text-text-primary">
        {readiness.issues.map((issue) => (
          <li key={issue.id}>{issue.message}</li>
        ))}
      </ul>
      <div className="mt-component flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
        {affectedSections.map((section) => {
          const isPatternBlocked =
            section === "pattern" && patternEditBlocked;

          return (
            <Button
              key={section}
              variant="secondary"
              disabled={isPatternBlocked}
              aria-describedby={
                isPatternBlocked
                  ? "configuration-pattern-edit-blocked"
                  : undefined
              }
              onClick={() => onEdit(section)}
            >
              {editActionLabels[section]}
            </Button>
          );
        })}
      </div>
      {patternEditBlocked ? (
        <p
          id="configuration-pattern-edit-blocked"
          className="mt-3 break-words text-supporting text-text-muted"
        >
          Complete the required measurements before opening pattern editing.
        </p>
      ) : null}
      <button
        type="button"
        disabled
        aria-describedby="configuration-review-unavailable-heading"
        className="mt-component inline-flex min-h-12 max-w-full items-center justify-center rounded-control border border-control-disabled-border bg-control-disabled-surface px-control-x py-control-y text-button font-control break-words text-control-disabled-text"
      >
        Review configuration unavailable
      </button>
    </section>
  );
}

interface ReviewEntryProps {
  onReview: () => void;
}

export function ReviewEntry({ onReview }: ReviewEntryProps) {
  return (
    <section className="mt-layout min-w-0 rounded-panel border border-brand bg-surface p-card shadow-raised">
      <p className="text-label font-control tracking-label text-accent-strong">
        Review
      </p>
      <h2 className="mt-2 break-words font-display text-section-title font-heading tracking-heading text-text-primary">
        Your configuration is ready to review
      </h2>
      <p className="mt-3 max-w-3xl break-words text-body text-text-muted">
        Check the visible details and prototype notice before printing or
        downloading a plain-text summary.
      </p>
      <Button className="mt-component" onClick={onReview}>
        Review configuration
      </Button>
    </section>
  );
}

/** "Rectangle cushion, Fern trail": a name to save under without asking. */
function defaultProjectName(
  configuration: ConfigurationState,
  fabric: SelectedPatternPresentation,
): string {
  const shape =
    configuration.shape === null
      ? "Cushion"
      : getCushionShapeDefinition(configuration.shape).label;
  return `${shape}, ${fabric.solidColor ? "Solid colour" : fabric.name}`.slice(
    0,
    120,
  );
}

interface ReviewScreenProps {
  configuration: ConfigurationState;
  readiness: Extract<ReviewReadiness, { status: "ready" }>;
  selectedPattern: SelectedPatternPresentation;
}

/**
 * The specification and the preview image, then output and saving. The stage
 * progress and "Back to Preview" are the ways back; nothing is repeated here.
 */
export function ReviewScreen({
  configuration,
  readiness,
  selectedPattern,
}: ReviewScreenProps) {
  const { summary } = readiness;

  return (
    <section
      aria-labelledby="configuration-review-heading"
      className="configuration-review-screen mt-layout min-w-0"
    >
      <header className="configuration-review-title">
        <p className="eyebrow font-mono text-eyebrow uppercase tracking-eyebrow text-accent-strong">
          Review
        </p>
        <h1
          id="configuration-review-heading"
          tabIndex={-1}
          className="configurator-edit-target mt-3 scroll-mt-layout break-words font-display text-page-title font-heading tracking-heading text-text-primary"
        >
          SewnCovers configuration summary
        </h1>
        <p className="mt-3 max-w-3xl break-words text-body text-text-muted">
          Check the details below, then print, download, save or share your
          design.
        </p>
      </header>

      <aside
        aria-labelledby="configuration-prototype-notice-heading"
        className={noticeClasses("prototype", "prototype-notice mt-component")}
      >
        <h2
          id="configuration-prototype-notice-heading"
          className={noticeTitleClasses("prototype")}
        >
          Prototype notice
        </h2>
        <p className="mt-2 break-words text-body text-notice-text">
          {summary.prototypeNotice}
        </p>
      </aside>

      <div className="review-summary-layout mt-layout grid min-w-0 gap-layout lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <ConfigurationSummary
          className="configuration-review-details"
          title="Configuration details"
          items={summary.fields}
        />
        <div className="review-preview print-hidden min-w-0">
          <PreviewStep selectedPattern={selectedPattern} variant="summary" />
        </div>
      </div>

      <div className="mt-component">
        <SummaryOutputActions summary={summary} />
      </div>

      <SaveSharePanel configuration={configuration} />
      <PrivateProjectPanel
        configuration={configuration}
        defaultName={defaultProjectName(configuration, selectedPattern)}
      />
    </section>
  );
}
