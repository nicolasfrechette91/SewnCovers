import type { Metadata } from "next";

import { Configurator } from "@/components/configurator/configurator";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Configure a cushion",
  description:
    "Choose a cushion shape, measurements, cover details, and pattern, then review, save, and share a prototype design with SewnCovers.",
  path: "/configure/",
});

export default function ConfigurePage() {
  return (
    <div className="configuration-page bg-page py-section">
      <div className="configuration-page-content mx-auto w-full max-w-6xl min-w-0 px-gutter">
        <header className="print-hidden max-w-3xl">
          <p className="text-label font-control tracking-label text-accent-strong">
            Cushion configurator
          </p>
          <h1 className="mt-2 font-display text-page-title font-heading tracking-heading text-text-primary">
            Build your custom cover design.
          </h1>
          <p className="mt-component break-words text-body text-text-muted">
            Choose from five cover shapes, follow the shape-specific
            measurement guidance, and set material, fit, closure, seam,
            pattern, and motif size. The proportional 2D preview and review
            summary keep your choices together before you save or share them.
            Previews are illustrative and are not manufacturing specifications.
          </p>
        </header>

        <Configurator />
      </div>
    </div>
  );
}
