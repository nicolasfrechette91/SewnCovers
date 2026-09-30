import type { Metadata } from "next";

import { Configurator } from "@/components/configurator/configurator";
import { PageHeader, PageShell } from "@/components/ui";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Configure a cushion",
  description:
    "Choose a cushion shape, measurements, cover details, and pattern, then review, save, and share a prototype design with SewnCovers.",
  path: "/configure/",
});

export default function ConfigurePage() {
  return (
    <PageShell
      className="configuration-page"
      contentClassName="configuration-page-content"
    >
      <PageHeader
        className="print-hidden"
        eyebrow="Cushion configurator"
        title="Build your custom cover design."
        lede="Choose from five cover shapes, follow the shape-specific measurement guidance, and set material, fit, closure, seam, pattern, and motif size. The proportional 2D preview and review summary keep your choices together before you save or share them. Previews are illustrative and are not manufacturing specifications."
      />

      <Configurator />
    </PageShell>
  );
}
