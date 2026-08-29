import type { Metadata } from "next";
import { Suspense } from "react";

import { OrdersScreen } from "@/components/commerce";
import { LoadingState } from "@/components/ui";

export const metadata: Metadata = { title: "Checkout return | SewnCovers", description: "Informational checkout return that polls authoritative server order status." };
export default function CheckoutReturnPage() { return <div className="bg-page py-section"><div className="mx-auto w-full max-w-6xl min-w-0 px-gutter"><header className="mb-layout"><p className="text-label font-control text-accent-strong">Informational redirect</p><h1 className="mt-2 font-display text-page-title font-heading">Checking payment status</h1></header><Suspense fallback={<LoadingState label="Checking authoritative order status…" />}><OrdersScreen pollPending /></Suspense></div></div>; }
