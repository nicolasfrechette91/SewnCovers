import type { Metadata } from "next";

import { Configurator } from "@/components/configurator";

export const metadata: Metadata = {
  title: "Configure a cushion | SewnCovers",
  description:
    "Choose and measure a square, rectangle, or box / bench cushion, explore 15 local patterns, and review a prototype summary with SewnCovers.",
};

export default function ConfigurePage() {
  return (
    <div className="configuration-page bg-page py-section">
      <div className="configuration-page-content mx-auto w-full max-w-6xl min-w-0 px-gutter">
        <header className="print-hidden max-w-3xl">
          <p className="text-label font-control tracking-label text-accent-strong">
            Cushion configurator
          </p>
          <h1 className="mt-2 font-display text-page-title font-heading tracking-heading text-text-primary">
            Choose your cushion&apos;s shape, measurements, and pattern.
          </h1>
          <p className="mt-component break-words text-body text-text-muted">
            Select Square, Rectangle, or Box / bench, then record the
            shape-specific measurements before filtering and choosing one
            of 15 local pattern directions, explore the proportional 2D
            preview, and review a printable or downloadable prototype
            summary.
          </p>
        </header>

        <Configurator />
      </div>
    </div>
  );
}
