import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountScreen } from "@/components/account";
import { LoadingState } from "@/components/ui";

export const metadata: Metadata = {
  title: "Account | SewnCovers",
  description: "Sign in or manage a SewnCovers account and its private data.",
};

export default function AccountPage() {
  return (
    <div className="bg-page py-section">
      <div className="mx-auto w-full max-w-4xl min-w-0 px-gutter">
        <header className="mb-layout max-w-3xl">
          <p className="text-label font-control text-accent-strong">Optional account workspace</p>
          <h1 className="mt-2 font-display text-page-title font-heading">Account and privacy controls</h1>
          <p className="mt-3 text-body text-text-muted">You can configure and create public design links without signing in. An account adds private projects, saved version history, custom pattern uploads, and read-only project links that you can revoke.</p>
        </header>
        <Suspense fallback={<LoadingState label="Opening account access…" />}>
          <AccountScreen />
        </Suspense>
      </div>
    </div>
  );
}
