import type { Metadata } from "next";
import { Suspense } from "react";

import { SandboxCheckoutScreen } from "@/components/commerce/sandbox-checkout-screen";
import { LoadingState, PageHeader, PageShell } from "@/components/ui";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({ title: "Fictional hosted checkout", description: "Deterministic local checkout with no card or live payment fields.", index: false, path: "/checkout/sandbox/" });
export default function SandboxCheckoutPage() {
  return (
    <PageShell width="reading">
      <PageHeader title="Hosted checkout" />
      <Suspense fallback={<LoadingState label="Opening fictional checkout…" />}>
        <SandboxCheckoutScreen />
      </Suspense>
    </PageShell>
  );
}
