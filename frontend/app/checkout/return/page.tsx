import type { Metadata } from "next";
import { Suspense } from "react";

import { OrdersScreen } from "@/components/commerce/orders-screen";
import { LoadingState, PageHeader, PageShell } from "@/components/ui";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Checkout return",
  description:
    "Return from the fictional checkout to check the demonstration order status.",
  index: false,
  path: "/checkout/return/",
});
export default function CheckoutReturnPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Fictional checkout return"
        title="Checking payment status"
      />
      <Suspense fallback={<LoadingState label="Checking order status…" />}>
        <OrdersScreen pollPending />
      </Suspense>
    </PageShell>
  );
}
