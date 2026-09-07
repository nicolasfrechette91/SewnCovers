import type { Metadata } from "next";
import { Suspense } from "react";

import { PricingQuotesScreen } from "@/components/commerce";
import { LoadingState } from "@/components/ui";

export const metadata: Metadata = { title: "Demonstration pricing and quotes | SewnCovers", description: "Fictional CAD pricing and private quote history for the SewnCovers sandbox." };

export default function CommercePage() { return <div className="bg-page py-section"><div className="mx-auto w-full max-w-6xl min-w-0 px-gutter"><header className="mb-layout max-w-3xl"><p className="text-label font-control text-accent-strong">Optional sandbox commerce</p><h1 className="mt-2 font-display text-page-title font-heading">Pricing and quotes</h1><p className="mt-3 text-text-muted">Choose a saved project version to try fictional CAD pricing, create a quote, and continue through the demonstration checkout.</p></header><Suspense fallback={<LoadingState label="Loading pricing workspace…" />}><PricingQuotesScreen /></Suspense></div></div>; }
