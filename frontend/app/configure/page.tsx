import type { Metadata } from "next";

import {
  ShapeSelectionStep,
  StepIndicator,
  type StepIndicatorStep,
} from "@/components/configurator";

const configuratorSteps = [
  { id: "shape", label: "Shape" },
  { id: "measurements", label: "Measurements" },
  { id: "pattern", label: "Pattern" },
  { id: "preview", label: "Preview" },
  { id: "review", label: "Review" },
] as const satisfies readonly StepIndicatorStep[];

export const metadata: Metadata = {
  title: "Choose a cushion shape | SewnCovers",
  description:
    "Choose the supported square cushion shape for the first SewnCovers configurator step.",
};

export default function ConfigurePage() {
  return (
    <div className="bg-page py-section">
      <div className="mx-auto w-full max-w-6xl min-w-0 px-gutter">
        <header className="max-w-3xl">
          <p className="text-label font-control tracking-label text-accent-strong">
            Cushion configurator
          </p>
          <h1 className="mt-2 font-display text-page-title font-heading tracking-heading text-text-primary">
            Start with your cushion&apos;s shape.
          </h1>
          <p className="mt-component break-words text-body text-text-muted">
            This first vertical slice lets you select a square cushion. Later
            configurator steps are shown for context but are not available yet.
          </p>
        </header>

        <StepIndicator
          className="mt-layout"
          currentStepId="shape"
          steps={configuratorSteps}
        />

        <section aria-label="Shape selection" className="mt-layout">
          <ShapeSelectionStep />
        </section>
      </div>
    </div>
  );
}
