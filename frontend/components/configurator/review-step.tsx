import {
  noticeClasses,
  noticeTitleClasses,
  eyebrowClasses,
} from "@/components/ui";
import type { ConfigurationState } from "@/context/configuration";
import { getCushionShapeDefinition } from "@/data/shapes";
import type { SelectedPatternPresentation } from "./preview-step";

import { ConfigurationSummary } from "./configuration-summary";
import { PreviewStep } from "./preview-step";
import { PrivateProjectPanel } from "./private-project-panel";
import { type ReviewReadiness } from "./review-summary";
import { SaveSharePanel } from "./save-share-panel";
import { SummaryOutputActions } from "./summary-output-actions";

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
        <p className={eyebrowClasses}>Review</p>
        <h1
          id="configuration-review-heading"
          tabIndex={-1}
          className="configurator-edit-target mt-3 scroll-mt-layout break-words font-display text-page-title font-heading tracking-heading text-text-primary"
        >
          SewnCovers configuration summary
        </h1>
        <p className="mt-3 max-w-reading break-words text-body text-text-muted">
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
