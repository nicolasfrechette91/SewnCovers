import type { Metadata } from "next";

import { CartScreen } from "@/components/commerce/cart-screen";
import { PageHeader, PageShell } from "@/components/ui";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({ title: "Demonstration cart", description: "A private cart for the fictional SewnCovers checkout workflow.", index: false, path: "/cart/" });
export default function CartPage() {
  return (
    <PageShell>
      <PageHeader eyebrow="Optional sandbox commerce" title="Cart" />
      <CartScreen />
    </PageShell>
  );
}
