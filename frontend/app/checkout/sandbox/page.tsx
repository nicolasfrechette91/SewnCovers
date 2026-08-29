import type { Metadata } from "next";
import { Suspense } from "react";

import { SandboxCheckoutScreen } from "@/components/commerce";
import { LoadingState } from "@/components/ui";

export const metadata: Metadata = { title: "Fictional hosted checkout | SewnCovers", description: "Deterministic local checkout with no card or live payment fields." };
export default function SandboxCheckoutPage() { return <div className="bg-page py-section"><div className="mx-auto w-full max-w-3xl min-w-0 px-gutter"><h1 className="mb-layout font-display text-page-title font-heading">Hosted checkout</h1><Suspense fallback={<LoadingState label="Opening fictional checkout…" />}><SandboxCheckoutScreen /></Suspense></div></div>; }
