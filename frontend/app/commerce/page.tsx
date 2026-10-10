import type { Metadata } from "next";
import { Suspense } from "react";

import { PricingQuotesScreen } from "@/components/commerce/pricing-quotes-screen";
import { PublicPricingOverview } from "@/components/commerce/public-pricing-overview";
import {
  LoadingState,
  PageHeader,
  PageShell,
  sectionTitleClasses,
  StitchDivider,
} from "@/components/ui";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Prototype pricing",
  description:
    "Review public fictional CAD pricing examples for the SewnCovers prototype, with an optional private quote workspace for signed-in accounts.",
  path: "/commerce/",
});

export default function CommercePage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Optional sandbox commerce"
        title="Pricing and quotes"
        lede="Explore illustrative demonstration prices publicly, then sign in if you want to create and keep an account-owned quote."
      />
      <PublicPricingOverview />
      <section className="mt-layout" aria-labelledby="private-pricing-heading">
        <StitchDivider className="mb-layout" />
        <h2 id="private-pricing-heading" className={sectionTitleClasses}>
          Your private quote workspace
        </h2>
        <p className="mt-2 mb-component max-w-reading text-body text-text-muted">
          Owned estimates, saved quotes, quote history, and cart actions are
          private to an account.
        </p>
        <Suspense
          fallback={
            <LoadingState label="Checking your private pricing workspace…" />
          }
        >
          <PricingQuotesScreen />
        </Suspense>
      </section>
    </PageShell>
  );
}
