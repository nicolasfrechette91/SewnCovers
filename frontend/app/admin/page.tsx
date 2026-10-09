import type { Metadata } from "next";

import { AdminScreen } from "@/components/commerce/admin-screen";
import { ProductionOperationsScreen } from "@/components/assurance/production-operations-screen";
import { ReadinessSummary } from "@/components/assurance/readiness-summary";
import { PageHeader, PageShell } from "@/components/ui";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Demonstration administration",
  description:
    "Role-protected demonstration pricing, manufacturing, fulfilment, refund, and audit operations.",
  index: false,
  path: "/admin/",
});
export default function AdminPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Protected sandbox operations"
        title="Administration"
      />
      <AdminScreen />
      <ProductionOperationsScreen />
      <ReadinessSummary />
    </PageShell>
  );
}
