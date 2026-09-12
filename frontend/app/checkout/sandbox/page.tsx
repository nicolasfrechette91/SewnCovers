import type { Metadata } from "next";
import { Suspense } from "react";

import { SandboxCheckoutScreen } from "@/components/commerce/sandbox-checkout-screen";
import { LoadingState } from "@/components/ui";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({ title: "Fictional hosted checkout", description: "Deterministic local checkout with no card or live payment fields.", index: false, path: "/checkout/sandbox/" });
export default function SandboxCheckoutPage() { return <div className="bg-page py-section"><div className="mx-auto w-full max-w-3xl min-w-0 px-gutter"><h1 className="mb-layout font-display text-page-title font-heading">Hosted checkout</h1><Suspense fallback={<LoadingState label="Opening fictional checkout…" />}><SandboxCheckoutScreen /></Suspense></div></div>; }
