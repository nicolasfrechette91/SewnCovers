import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState } from "@/components/ui";
import { ProjectsScreen } from "@/components/projects";

export const metadata: Metadata = {
  title: "My projects | SewnCovers",
  description: "Private named SewnCovers projects and immutable version history.",
};

export default function ProjectsPage() {
  return (
    <div className="bg-page py-section">
      <div className="mx-auto w-full max-w-6xl min-w-0 px-gutter">
        <header className="mb-layout max-w-3xl">
          <p className="text-label font-control text-accent-strong">Account workspace</p>
          <h1 className="mt-2 font-display text-page-title font-heading">My projects</h1>
          <p className="mt-3 text-body text-text-muted">Projects are private by default. Their complete configuration versions are account-owned and are shared only when you explicitly create a revocable read-only bearer link.</p>
        </header>
        <Suspense fallback={<LoadingState label="Loading project workspace…" />}><ProjectsScreen /></Suspense>
      </div>
    </div>
  );
}
