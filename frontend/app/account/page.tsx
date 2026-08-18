import type { Metadata } from "next";

import { AccountScreen } from "@/components/account";

export const metadata: Metadata = {
  title: "Account | SewnCovers",
  description: "Sign in or manage SewnCovers account sessions and private data.",
};

export default function AccountPage() {
  return (
    <div className="bg-page py-section">
      <div className="mx-auto w-full max-w-4xl min-w-0 px-gutter">
        <header className="mb-layout max-w-3xl">
          <p className="text-label font-control text-accent-strong">Optional account workspace</p>
          <h1 className="mt-2 font-display text-page-title font-heading">Account and privacy controls</h1>
          <p className="mt-3 text-body text-text-muted">Guest configuration and immutable public design links remain available without signing in. Accounts add private projects, immutable version history, and explicitly revocable read-only shares.</p>
        </header>
        <AccountScreen />
      </div>
    </div>
  );
}
