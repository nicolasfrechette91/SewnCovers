import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState } from "@/components/ui";
import { ProjectsScreen } from "@/components/projects";

export const metadata: Metadata = {
  title: "My projects | SewnCovers",
  description: "Private named SewnCovers projects and their saved version history.",
};

export default function ProjectsPage() {
  return (
    <div className="bg-page py-section">
      <div className="mx-auto w-full max-w-6xl min-w-0 px-gutter">
        <header className="mb-layout max-w-3xl">
          <p className="text-label font-control text-accent-strong">Account workspace</p>
          <h1 className="mt-2 font-display text-page-title font-heading">My projects</h1>
          <p className="mt-3 text-body text-text-muted">Projects keep named designs and their saved versions private in your account. A version becomes viewable to others only when you create a read-only share link, which you can revoke later.</p>
        </header>
        <Suspense fallback={<LoadingState label="Loading project workspace…" />}><ProjectsScreen /></Suspense>
      </div>
    </div>
  );
}
