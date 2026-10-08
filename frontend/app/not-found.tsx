import type { Metadata } from "next";

// Direct imports, not the @/components/ui barrel: this boundary sits under
// every route, and the barrel would add its client controls to each one.
import { PageHeader, PageShell } from "@/components/ui/headers";
import { ButtonLink } from "@/components/ui/links";

export const metadata: Metadata = {
  title: "Page not found",
};

// The export writes this as 404.html, which GitHub Pages serves for any
// unknown path under the site. Links go through next/link, so they keep the
// /SewnCovers base path wherever the visitor landed.
export default function NotFound() {
  return (
    <PageShell width="content">
      <PageHeader
        eyebrow="Page not found"
        title="This page doesn't exist."
        lede="The link may be mistyped or out of date."
      />
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
        <ButtonLink href="/configure/">Design a cover</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Go to the home page
        </ButtonLink>
      </div>
    </PageShell>
  );
}
