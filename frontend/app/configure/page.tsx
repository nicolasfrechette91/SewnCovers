import type { Metadata } from "next";

import { Configurator } from "@/components/configurator/configurator";
import { PageHeader, PageShell } from "@/components/ui";
import { createPageMetadata, SITE_NAME } from "@/config/site-metadata";

const PAGE_TITLE = "Configure a cushion";

export const metadata: Metadata = createPageMetadata({
  title: PAGE_TITLE,
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
      {/* Rendered here, on the server, so the header code stays out of the
          client bundle. The configurator shows it on the first stage only;
          from stage 2 each stage heading is the page's h1. */}
      <Configurator
        documentTitle={`${PAGE_TITLE} | ${SITE_NAME}`}
        intro={
          <PageHeader
            className="print-hidden"
            eyebrow="Cushion configurator"
            title="Build your custom cover design."
            lede="Pick a shape, add your measurements and choose a fabric, then preview your cover before you save or share it."
          />
        }
      />
    </PageShell>
  );
}
