import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountNavigation } from "@/components/account/account-navigation";
import { OrdersScreen } from "@/components/commerce/orders-screen";
import { LoadingState, PageHeader, PageShell } from "@/components/ui";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Demonstration orders",
  description:
    "Private fictional order history, production states, and fulfilment timelines.",
  index: false,
  path: "/orders/",
});
export default function OrdersPage() {
  return (
    <PageShell>
      <PageHeader eyebrow="Optional sandbox commerce" title="Orders" />
      <AccountNavigation currentHref="/orders/" />
      <Suspense fallback={<LoadingState label="Loading order history…" />}>
        <OrdersScreen />
      </Suspense>
    </PageShell>
  );
}
