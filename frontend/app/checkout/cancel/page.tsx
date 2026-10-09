import type { Metadata } from "next";

import { DemoBanner } from "@/components/commerce/demo-banner";
import {
  ButtonLink,
  PageShell,
  pageTitleClasses,
  Surface,
} from "@/components/ui";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Checkout cancelled",
  description:
    "Informational cancellation page for hosted demonstration checkout.",
  index: false,
  path: "/checkout/cancel/",
});
export default function CheckoutCancelPage() {
  return (
    <PageShell width="reading" contentClassName="space-y-component">
      <DemoBanner />
      <Surface as="section">
        <h1 className={pageTitleClasses}>Checkout was not completed</h1>
        <p className="mt-3 text-body text-text-muted">
          No fictional payment was completed. Review your demonstration orders
          or return to pricing.
        </p>
        <div className="mt-component flex flex-wrap gap-3">
          <ButtonLink href="/orders/">View orders</ButtonLink>
          <ButtonLink href="/commerce/" variant="secondary">
            Pricing and quotes
          </ButtonLink>
        </div>
      </Surface>
    </PageShell>
  );
}
