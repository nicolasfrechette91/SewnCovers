import type { Metadata } from "next";
import Link from "next/link";

import {
  createPageMetadata,
  REPOSITORY_URL,
  siteUrl,
} from "@/config/site-metadata";

const description =
  "A concise case study of the product, accessibility, privacy, testing, and performance decisions behind the SewnCovers portfolio prototype.";

export const metadata: Metadata = createPageMetadata({
  description,
  path: "/case-study/",
  title: "Case study",
});

const decisions = [
  {
    body: "The experience starts with the cushion someone already owns. Shape-specific measurement terms keep the task concrete before fabric direction or preview choices are introduced.",
    title: "Lead with the real object",
  },
  {
    body: "The guided configurator reveals one stage at a time, while review keeps a complete text summary authoritative. Visual previews communicate direction without becoming manufacturing specifications.",
    title: "Make progress understandable",
  },
  {
    body: "Public demonstration pricing stays visible without an account. Projects, quotes, orders, uploads, and operational tools remain separate, account-owned contexts.",
    title: "Separate public exploration from ownership",
  },
] as const;

const qualityAreas = [
  {
    body: "Semantic headings, native controls, keyboard paths, visible focus, text equivalents, forced-colors support, reduced-motion behavior, and narrow-width reflow are covered by automated checks. This is evidence, not a WCAG conformance claim.",
    title: "Accessibility and responsive approach",
  },
  {
    body: "The static client keeps public configuration and tab-scoped bearer access; the API owns authorization and private records. Private custom imagery is granted temporarily, and public designs use built-in patterns only.",
    title: "Privacy and security boundaries",
  },
  {
    body: "Unit, component, service, configuration, static-export, and production-browser tests cover the customer journey and authorization boundaries in both ordinary and GitHub Pages builds.",
    title: "Testing and quality strategy",
  },
  {
    body: "The public experience is statically exported. Later configurator stages and the optional 3D renderer are loaded only when requested, while automated budgets guard important initial routes.",
    title: "Performance work",
  },
] as const;

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  applicationCategory: "DesignApplication",
  description,
  name: "SewnCovers portfolio prototype",
  operatingSystem: "Web",
  url: siteUrl("/"),
} as const;

const primaryLinkClasses =
  "inline-flex min-h-12 max-w-full items-center justify-center rounded-control border border-brand bg-brand px-control-x py-control-y text-center text-button font-control tracking-label break-words text-on-brand shadow-raised hover:border-brand-hover hover:bg-brand-hover active:border-brand-active active:bg-brand-active";
const secondaryLinkClasses =
  "inline-flex min-h-12 max-w-full items-center justify-center rounded-control border border-border-strong bg-surface px-control-x py-control-y text-center text-button font-control tracking-label break-words text-text-primary shadow-card hover:bg-surface-subtle active:text-brand-active";

export default function CaseStudyPage() {
  return (
    <div className="bg-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <section className="border-b border-border bg-surface py-section">
        <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-layout px-gutter lg:grid-cols-[minmax(0,1.15fr)_minmax(17rem,0.65fr)] lg:items-center">
          <header className="min-w-0 max-w-3xl">
            <p className="text-label font-control tracking-label text-accent-strong">
              Portfolio case study
            </p>
            <h1 className="mt-3 font-display text-page-title font-heading tracking-heading text-text-primary">
              A measured path from cushion dimensions to a reviewable cover idea.
            </h1>
            <p className="mt-component text-body text-text-muted sm:text-lg sm:leading-8">
              SewnCovers is a full-stack portfolio prototype that explores how
              a guided, accessible workflow can make replacement-cover planning
              clearer without presenting a visual study as a purchasable product.
            </p>
            <div className="mt-8 flex min-w-0 flex-wrap gap-3">
              <Link href="/configure/" className={primaryLinkClasses}>
                Explore the configurator
              </Link>
              <Link href="/trust/" className={secondaryLinkClasses}>
                Review technical evidence
              </Link>
            </div>
          </header>

          <div
            aria-hidden="true"
            className="flex min-h-64 items-center justify-center overflow-hidden rounded-panel border border-border bg-surface-subtle p-card shadow-raised"
          >
            <span className="landing-cushion landing-cushion-square landing-pattern-botanical block w-[68%] max-w-56" />
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl min-w-0 px-gutter py-section">
        <section aria-labelledby="opportunity-title" className="grid min-w-0 gap-component lg:grid-cols-2">
          <div className="min-w-0 rounded-panel border border-border bg-surface p-card shadow-card">
            <p className="text-label font-control tracking-label text-accent-strong">
              Problem or opportunity
            </p>
            <h2 id="opportunity-title" className="mt-2 font-display text-section-title font-heading">
              Planning starts before a product exists.
            </h2>
            <p className="mt-3 text-text-muted">
              Replacement covers depend on an existing cushion&apos;s geometry,
              dimensions, construction choices, and fabric direction. The
              prototype turns those inputs into a consistent configuration and
              a clearly bounded visual summary.
            </p>
          </div>
          <div className="min-w-0 rounded-panel border border-border bg-surface p-card shadow-card">
            <p className="text-label font-control tracking-label text-accent-strong">
              Intended customer journey
            </p>
            <h2 className="mt-2 font-display text-section-title font-heading">
              Configure, preview, review, then choose whether to save.
            </h2>
            <p className="mt-3 text-text-muted">
              A guest can move through Shape, Measurements, Cover details,
              Pattern, Preview, and Review. Public saving creates an immutable
              prototype link; account features add private projects and
              demonstration commerce without changing the core journey.
            </p>
          </div>
        </section>

        <section aria-labelledby="decisions-title" className="mt-layout">
          <p className="text-label font-control tracking-label text-accent-strong">
            Key product decisions
          </p>
          <h2 id="decisions-title" className="mt-2 font-display text-section-title font-heading">
            Boundaries are part of the experience.
          </h2>
          <ul className="mt-component grid min-w-0 gap-component md:grid-cols-3">
            {decisions.map((decision) => (
              <li key={decision.title} className="min-w-0 rounded-card border border-border bg-surface p-card">
                <h3 className="font-display text-xl font-heading text-text-primary">
                  {decision.title}
                </h3>
                <p className="mt-3 text-text-muted">{decision.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="technical-title" className="mt-layout rounded-panel border border-border bg-surface-subtle p-card">
          <p className="text-label font-control tracking-label text-accent-strong">
            Technical approach
          </p>
          <h2 id="technical-title" className="mt-2 font-display text-section-title font-heading">
            Static public delivery with API-owned authority.
          </h2>
          <p className="mt-3 max-w-4xl text-text-muted">
            Next.js exports the route shells for ordinary hosting and the
            case-sensitive <span className="wrap-anywhere font-mono">/SewnCovers/</span> GitHub Pages path.
            React context owns in-progress configuration, while a FastAPI
            service owns catalogue data, persistence, accounts, authorization,
            pricing, commerce state, and private assets. The separation keeps
            public pages lightweight and prevents the browser from becoming the
            authority for protected actions.
          </p>
        </section>

        <section aria-labelledby="quality-title" className="mt-layout">
          <p className="text-label font-control tracking-label text-accent-strong">
            Implementation evidence
          </p>
          <h2 id="quality-title" className="mt-2 font-display text-section-title font-heading">
            Quality is checked at several boundaries.
          </h2>
          <dl className="mt-component grid min-w-0 gap-component lg:grid-cols-2">
            {qualityAreas.map((area) => (
              <div key={area.title} className="min-w-0 rounded-card border border-border bg-surface p-card shadow-card">
                <dt className="font-display text-xl font-heading text-text-primary">
                  {area.title}
                </dt>
                <dd className="mt-3 text-text-muted">{area.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="limitations-title" className="mt-layout rounded-panel border border-border-strong bg-surface p-card">
          <p className="text-label font-control tracking-label text-accent-strong">
            Prototype limitations
          </p>
          <h2 id="limitations-title" className="mt-2 font-display text-section-title font-heading">
            Demonstrated behavior is not commercial readiness.
          </h2>
          <p className="mt-3 max-w-4xl text-text-muted">
            SewnCovers cannot manufacture or ship a cover, charge a real payment,
            or promise fit, availability, uptime, accessibility conformance, or
            security certification. External payment, storage, and moderation
            providers are configured but not live-verified here. Legal,
            accessibility, security, manufacturing, and operational review
            remain necessary before production use.
          </p>
        </section>

        <section aria-labelledby="explore-title" className="mt-layout rounded-panel bg-brand p-card text-on-brand">
          <h2 id="explore-title" className="font-display text-section-title font-heading">
            Explore the work
          </h2>
          <p className="mt-3 max-w-3xl">
            Use the prototype for the customer journey, Trust for detailed
            evidence and boundaries, or the verified public repository for the
            implementation and tests.
          </p>
          <div className="mt-component flex min-w-0 flex-wrap gap-3">
            <Link href="/" className="inline-flex min-h-12 items-center rounded-control border border-on-brand bg-surface px-control-x py-control-y text-button font-control text-brand no-underline hover:bg-surface-subtle">
              Visit the prototype
            </Link>
            <Link href="/trust/" className="inline-flex min-h-12 items-center rounded-control border border-on-brand px-control-x py-control-y text-button font-control text-on-brand underline underline-offset-4">
              Open Trust evidence
            </Link>
            <a
              href={REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 max-w-full items-center rounded-control border border-on-brand px-control-x py-control-y text-button font-control break-all text-on-brand underline underline-offset-4"
            >
              View source repository
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
