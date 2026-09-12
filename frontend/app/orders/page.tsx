import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountNavigation } from "@/components/account/account-navigation";
import { OrdersScreen } from "@/components/commerce/orders-screen";
import { LoadingState } from "@/components/ui";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({ title: "Demonstration orders", description: "Private fictional order history, production states, and fulfilment timelines.", index: false, path: "/orders/" });
export default function OrdersPage() { return <div className="bg-page py-section"><div className="mx-auto w-full max-w-6xl min-w-0 px-gutter"><header className="mb-layout"><p className="text-label font-control text-accent-strong">Optional sandbox commerce</p><h1 className="mt-2 font-display text-page-title font-heading">Orders</h1></header><AccountNavigation currentHref="/orders/" /><Suspense fallback={<LoadingState label="Loading order history…" />}><OrdersScreen /></Suspense></div></div>; }
