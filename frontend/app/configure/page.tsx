import type { Metadata } from "next";

import { Configurator } from "@/components/configurator";

export const metadata: Metadata = {
  title: "Configure a cushion | SewnCovers",
  description:
    "Choose a cushion shape, measurements, cover details, and pattern, then review, save, and share a prototype design with SewnCovers.",
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
            Build your custom cover specification.
          </h1>
          <p className="mt-component break-words text-body text-text-muted">
            Choose from five cover shapes, follow the shape-specific
            measurement guidance, and set material, fit, closure, seam,
            pattern, and motif size. The proportional 2D preview and review
            summary keep the complete prototype specification together
            before you save or share it.
          </p>
        </header>

        <Configurator />
      </div>
    </div>
  );
}
