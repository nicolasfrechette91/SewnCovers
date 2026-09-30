import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState, PageHeader, PageShell } from "@/components/ui";
import { ProjectsScreen } from "@/components/projects/projects-screen";
import { createPageMetadata } from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({
  title: "My projects",
  description: "Private named SewnCovers projects and their saved version history.",
  index: false,
  path: "/projects/",
});

export default function ProjectsPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Account workspace"
        title="My projects"
        lede="Projects keep named designs and their saved versions private in your account. A version becomes viewable to others only when you create a read-only share link, which you can revoke later."
      />
      <Suspense fallback={<LoadingState label="Loading project workspace…" />}><ProjectsScreen /></Suspense>
    </PageShell>
  );
}
