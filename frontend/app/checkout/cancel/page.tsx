import type { Metadata } from "next";
import Link from "next/link";

import { DemoBanner } from "@/components/commerce/demo-banner";

export const metadata: Metadata = { title: "Checkout cancelled | SewnCovers", description: "Informational cancellation page for hosted demonstration checkout." };
export default function CheckoutCancelPage() { return <div className="bg-page py-section"><div className="mx-auto w-full max-w-3xl min-w-0 px-gutter space-y-component"><DemoBanner /><section className="rounded-panel border border-border bg-surface p-card"><h1 className="font-display text-page-title font-heading">Checkout was not completed</h1><p className="mt-3 text-text-muted">No fictional payment was completed. Review your demonstration orders or return to pricing.</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/orders/" className="inline-flex min-h-12 items-center rounded-control bg-brand px-control-x text-button font-control text-on-brand no-underline">View orders</Link><Link href="/commerce/" className="inline-flex min-h-12 items-center rounded-control border border-border-strong px-control-x text-button font-control no-underline">Pricing and quotes</Link></div></section></div></div>; }
