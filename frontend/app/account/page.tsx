import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountScreen } from "@/components/account/account-screen";
import { LoadingState, PageHeader, PageShell } from "@/components/ui";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Account",
  description: "Sign in or manage a SewnCovers account and its private data.",
  index: false,
  path: "/account/",
});

export default function AccountPage() {
  return (
    <PageShell width="content">
      <PageHeader
        eyebrow="Optional account workspace"
        title="Account and privacy controls"
        lede="You can configure and create public design links without signing in. An account adds private projects, saved version history, custom pattern uploads, and read-only project links that you can revoke."
      />
      <div className="min-h-[36rem]">
        <Suspense fallback={<LoadingState label="Opening account access…" />}>
          <AccountScreen />
        </Suspense>
      </div>
    </PageShell>
  );
}
