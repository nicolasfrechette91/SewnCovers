import type { Metadata } from "next";

import { AdminScreen } from "@/components/commerce";

export const metadata: Metadata = { title: "Demonstration administration | SewnCovers", description: "Role-protected demonstration pricing, manufacturing, fulfilment, refund, and audit operations." };
export default function AdminPage() { return <div className="bg-page py-section"><div className="mx-auto w-full max-w-6xl min-w-0 px-gutter"><header className="mb-layout"><p className="text-label font-control text-accent-strong">Protected sandbox operations</p><h1 className="mt-2 font-display text-page-title font-heading">Administration</h1></header><AdminScreen /></div></div>; }
