import type { Metadata } from "next";

import { SquareConfigurator } from "@/components/configurator";

export const metadata: Metadata = {
  title: "Configure a square cushion | SewnCovers",
  description:
    "Choose and measure a square cushion, then explore three local prototype patterns with SewnCovers.",
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
            Select the available square shape, then record its width and
            thickness before choosing one of three prototype pattern
            directions. Preview and review steps are shown only for context
            and are not available yet.
          </p>
        </header>

        <SquareConfigurator />
      </div>
    </div>
  );
}
