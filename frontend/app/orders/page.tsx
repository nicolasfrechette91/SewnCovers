import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountNavigation } from "@/components/account";
import { OrdersScreen } from "@/components/commerce";
import { LoadingState } from "@/components/ui";

export const metadata: Metadata = { title: "Demonstration orders | SewnCovers", description: "Private fictional order history, production states, and fulfilment timelines." };
export default function OrdersPage() { return <div className="bg-page py-section"><div className="mx-auto w-full max-w-6xl min-w-0 px-gutter"><header className="mb-layout"><p className="text-label font-control text-accent-strong">Optional sandbox commerce</p><h1 className="mt-2 font-display text-page-title font-heading">Orders</h1></header><AccountNavigation currentHref="/orders/" /><Suspense fallback={<LoadingState label="Loading order history…" />}><OrdersScreen /></Suspense></div></div>; }
