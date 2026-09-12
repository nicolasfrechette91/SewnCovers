import type { Metadata } from "next";

import { CartScreen } from "@/components/commerce/cart-screen";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({ title: "Demonstration cart", description: "A private cart for the fictional SewnCovers checkout workflow.", index: false, path: "/cart/" });
export default function CartPage() { return <div className="bg-page py-section"><div className="mx-auto w-full max-w-6xl min-w-0 px-gutter"><header className="mb-layout"><p className="text-label font-control text-accent-strong">Optional sandbox commerce</p><h1 className="mt-2 font-display text-page-title font-heading">Cart</h1></header><CartScreen /></div></div>; }
