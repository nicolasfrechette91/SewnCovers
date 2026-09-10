import type { Metadata } from "next";
import { Suspense } from "react";

import { PricingQuotesScreen } from "@/components/commerce";
import { PublicPricingOverview } from "@/components/commerce/public-pricing-overview";
import { LoadingState } from "@/components/ui";

export const metadata: Metadata = { title: "Demonstration pricing and quotes | SewnCovers", description: "Fictional CAD pricing and private quote history for the SewnCovers sandbox." };

export default function CommercePage() { return <div className="bg-page py-section"><div className="mx-auto w-full max-w-6xl min-w-0 px-gutter"><header className="mb-layout max-w-3xl"><p className="text-label font-control text-accent-strong">Optional sandbox commerce</p><h1 className="mt-2 font-display text-page-title font-heading">Pricing and quotes</h1><p className="mt-3 text-text-muted">Explore illustrative demonstration prices publicly, then sign in if you want to create and keep an account-owned quote.</p></header><PublicPricingOverview /><section className="mt-layout" aria-labelledby="private-pricing-heading"><h2 id="private-pricing-heading" className="font-display text-section-title font-heading">Your private quote workspace</h2><p className="mt-2 mb-component max-w-3xl text-text-muted">Owned estimates, saved quotes, quote history, and cart actions are private to an account.</p><Suspense fallback={<LoadingState label="Checking your private pricing workspace…" />}><PricingQuotesScreen /></Suspense></section></div></div>; }
