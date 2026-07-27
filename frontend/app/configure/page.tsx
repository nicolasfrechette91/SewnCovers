import type { Metadata } from "next";

import { Configurator } from "@/components/configurator";

export const metadata: Metadata = {
  title: "Configure a cushion | SewnCovers",
  description:
    "Choose and measure a square, rectangle, or box / bench cushion, then explore 15 local patterns with SewnCovers.",
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
            Choose your cushion&apos;s shape, measurements, and pattern.
          </h1>
          <p className="mt-component break-words text-body text-text-muted">
            Select Square, Rectangle, or Box / bench, then record the
            shape-specific measurements before filtering and choosing one
            of 15 local pattern directions, then explore the proportional 2D
            preview. The review step is shown only for context and is not
            available yet.
          </p>
        </header>

        <Configurator />
      </div>
    </div>
  );
}
