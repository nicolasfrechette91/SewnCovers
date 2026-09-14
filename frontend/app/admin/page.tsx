import type { Metadata } from "next";

import { AdminScreen } from "@/components/commerce/admin-screen";
import { ProductionOperationsScreen } from "@/components/assurance/production-operations-screen";
import { ReadinessSummary } from "@/components/assurance/readiness-summary";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({ title: "Demonstration administration", description: "Role-protected demonstration pricing, manufacturing, fulfilment, refund, and audit operations.", index: false, path: "/admin/" });
export default function AdminPage() { return <div className="bg-page py-section"><div className="mx-auto w-full max-w-6xl min-w-0 px-gutter"><header className="mb-layout"><p className="text-label font-control text-accent-strong">Protected sandbox operations</p><h1 className="mt-2 font-display text-page-title font-heading">Administration</h1></header><AdminScreen /><ProductionOperationsScreen /><ReadinessSummary /></div></div>; }
