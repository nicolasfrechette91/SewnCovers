import type { Metadata } from "next";

import { ShapeIllustration } from "@/components/configurator/shape-illustration";
import {
  ButtonLink,
  noticeClasses,
  noticeTitleClasses,
  sectionTitleClasses,
} from "@/components/ui";
import {
  createPageMetadata,
  DEFAULT_DESCRIPTION,
} from "@/config/site-metadata";
import { cushionShapeDefinitions } from "@/data/shapes";

export const metadata: Metadata = createPageMetadata({
  description: DEFAULT_DESCRIPTION,
  isHome: true,
  path: "/",
  title: "SewnCovers",
});

const designSteps = [
  "Pick the shape that matches your cushion.",
  "Enter its measurements, with a diagram to guide you.",
  "Choose fabric and a pattern, then preview, save or share.",
] as const;

export default function Home() {
  return (
    <>
      <section
        aria-labelledby="landing-title"
        className="landing-hero overflow-hidden border-b border-border"
      >
        <div className="mx-auto grid w-full max-w-page min-w-0 gap-layout px-gutter py-section lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] lg:items-center lg:gap-16">
          <div className="min-w-0">
            <h1
              id="landing-title"
              className="max-w-3xl font-display text-display font-heading tracking-heading text-text-primary"
            >
              Design a cover that fits the cushion you already have.
            </h1>
            <p className="mt-component max-w-2xl text-lede text-text-muted">
              Enter its measurements, choose fabric and a pattern, and see a
              preview. No account needed.
            </p>
            <ButtonLink href="/configure/" className="mt-8">
              Start configuring
            </ButtonLink>
          </div>

          {/* Decorative; below lg it would only push the next step down. */}
          <div
            aria-hidden="true"
            className="hidden min-w-0 rounded-panel border border-border bg-surface p-4 shadow-raised lg:block"
          >
            <div className="cutting-mat flex min-h-80 items-center justify-center overflow-hidden rounded-card border border-border px-card py-10">
              <span className="landing-measured">
                <span className="landing-cushion landing-pattern-botanical block w-full" />
                <span className="dimension dimension-x">
                  <span className="dimension-label">45 cm</span>
                </span>
                <span className="dimension dimension-y">
                  <span className="dimension-label">45 cm</span>
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="how-it-works-title"
        className="bg-surface-subtle py-section"
      >
        <div className="mx-auto w-full max-w-page min-w-0 px-gutter">
          <h2 id="how-it-works-title" className={sectionTitleClasses}>
            How it works
          </h2>

          <ol className="landing-steps mt-layout grid min-w-0 gap-component lg:grid-cols-3">
            {designSteps.map((step, index) => (
              <li
                key={step}
                className="flex min-w-0 items-center gap-4 lg:flex-col lg:px-4 lg:text-center"
              >
                <span className="landing-step-marker flex size-12 shrink-0 items-center justify-center rounded-pill border-[1.5px] border-brand bg-surface font-mono text-readout text-brand shadow-card">
                  <span className="sr-only">Step </span>
                  {index + 1}
                </span>
                <p className="min-w-0 break-words text-subhead text-text-primary">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="shapes-title"
        className="bg-page pt-section pb-layout"
      >
        <div className="mx-auto w-full max-w-page min-w-0 px-gutter">
          <h2 id="shapes-title" className={sectionTitleClasses}>
            Five cushion shapes
          </h2>

          <ul className="mt-layout grid min-w-0 gap-3 sm:grid-cols-6 sm:gap-component lg:grid-cols-5">
            {cushionShapeDefinitions.map((shape) => (
              <li
                key={shape.id}
                className="flex min-w-0 items-center gap-4 rounded-panel border border-border bg-surface p-3 shadow-hairline sm:col-span-2 sm:flex-col sm:gap-3 sm:p-4 sm:text-center sm:nth-4:col-start-2 lg:col-span-1 lg:nth-4:col-start-auto"
              >
                <ShapeIllustration
                  shape={shape.id}
                  className="h-12 w-20 shrink-0 sm:h-20 sm:w-full sm:max-w-40"
                />
                <span className="min-w-0 break-words text-subhead font-control text-text-primary">
                  {shape.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* The page's only prototype disclaimer; the footer leaves it out here. */}
      <div className="bg-page pb-section">
        <div className="mx-auto w-full max-w-page min-w-0 px-gutter">
          <aside
            aria-labelledby="prototype-status-title"
            className={noticeClasses("prototype", "max-w-3xl")}
          >
            <h2
              id="prototype-status-title"
              className={noticeTitleClasses("prototype")}
            >
              Prototype
            </h2>
            <p className="mt-2 text-supporting text-notice-text">
              SewnCovers is a portfolio demo. It cannot charge money, create a
              real shipment, or produce finished covers.
            </p>
          </aside>
        </div>
      </div>

      <section aria-labelledby="landing-cta-title" className="landing-cta">
        <div className="relative mx-auto flex w-full max-w-page min-w-0 flex-col gap-component px-gutter py-layout sm:flex-row sm:items-center sm:justify-between">
          <h2
            id="landing-cta-title"
            className="min-w-0 font-display text-section-title font-heading tracking-heading text-on-brand"
          >
            Ready with a tape measure?
          </h2>
          <ButtonLink
            href="/configure/"
            variant="secondary"
            className="shrink-0 self-start border-on-brand bg-surface text-brand hover:border-on-brand hover:bg-surface-subtle hover:text-brand-hover sm:self-auto"
          >
            Start configuring
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
