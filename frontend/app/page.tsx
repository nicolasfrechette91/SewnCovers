import type { Metadata } from "next";

import { CushionExample } from "@/components/landing";
import {
  ButtonLink,
  buttonClasses,
  cardTitleClasses,
  eyebrowClasses,
  noticeClasses,
  noticeTitleClasses,
  sectionTitleClasses,
  StitchDivider,
  textLinkClasses,
} from "@/components/ui";
import {
  createPageMetadata,
  DEFAULT_DESCRIPTION,
} from "@/config/site-metadata";

export const metadata: Metadata = createPageMetadata({
  description: DEFAULT_DESCRIPTION,
  isHome: true,
  path: "/",
  title: "SewnCovers",
});

const coverExamples = [
  {
    description:
      "A square face with an organic, leaf-inspired fabric direction.",
    pattern: "botanical",
    shape: "square",
    title: "Square throw cushion",
  },
  {
    description:
      "A longer front face with a warm, structured geometric direction.",
    pattern: "geometric",
    shape: "rectangle",
    title: "Rectangle lumbar cushion",
  },
  {
    description:
      "A deep bench profile with a quiet, small-scale woven direction.",
    pattern: "woven",
    shape: "box",
    title: "Box / bench cushion",
  },
] as const;

const designSteps = [
  {
    description:
      "Identify a supported shape and record the dimensions of the cushion you already have.",
    title: "Measure what you have",
  },
  {
    description:
      "Compare fabric directions and consider how a pattern could sit across the cushion face.",
    title: "Explore the finish",
  },
  {
    description:
      "Bring the measurements and fabric direction together in a clear visual summary.",
    title: "Review the idea",
  },
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
            <p className={eyebrowClasses}>A cushion-cover design prototype</p>
            <h1
              id="landing-title"
              className="mt-5 max-w-3xl font-display text-display font-heading tracking-heading text-text-primary"
            >
              Plan a replacement cover around your cushion&apos;s real
              measurements.
            </h1>
            <p className="mt-component max-w-2xl text-lede text-text-muted">
              SewnCovers explores a guided way to combine a supported cushion
              shape, exact dimensions, and a fabric direction before saving a
              design.
            </p>
            <div className="landing-hero-actions mt-8 flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <ButtonLink href="/configure/">Start configuring</ButtonLink>
              <a
                href="#examples"
                className={buttonClasses({
                  element: "link",
                  variant: "secondary",
                })}
              >
                Explore cover examples
              </a>
              <a href="#how-it-works" className={`${textLinkClasses} px-2`}>
                See how the idea works
              </a>
            </div>

            <aside
              aria-labelledby="prototype-status-title"
              className={noticeClasses("prototype", "mt-10 max-w-2xl")}
            >
              <h2
                id="prototype-status-title"
                className={noticeTitleClasses("prototype")}
              >
                Prototype status
              </h2>
              <p className="mt-2 text-supporting text-notice-text">
                This experience demonstrates the design journey and an optional
                fictional CAD commerce sandbox. It cannot charge money, create
                a real shipment, or produce finished covers.
              </p>
            </aside>
          </div>

          <figure className="min-w-0 rounded-panel border border-border bg-surface p-3 shadow-raised sm:p-4">
            <div
              aria-hidden="true"
              className="cutting-mat relative flex min-h-80 items-center justify-center overflow-hidden rounded-card border border-border px-card pt-24 pb-14 sm:min-h-96"
            >
              <span className="absolute bottom-4 left-4 font-mono text-eyebrow uppercase tracking-eyebrow text-brand">
                Shape + size + fabric
              </span>
              <span className="landing-measured">
                <span className="landing-cushion landing-cushion-square landing-pattern-botanical block w-full" />
                <span className="dimension dimension-x">
                  <span className="dimension-label">45 cm</span>
                </span>
                <span className="dimension dimension-y">
                  <span className="dimension-label">45 cm</span>
                </span>
              </span>
              <span className="absolute top-3 right-3 flex max-w-44 flex-col gap-0.5 rounded-control border border-border bg-surface px-3 py-2 text-supporting text-text-muted shadow-card">
                <span className="font-control text-text-primary">
                  Visual direction
                </span>
                <span>before a saved design</span>
              </span>
            </div>
            <figcaption className="mt-3 px-1 text-supporting text-text-muted">
              Illustrative study of a measured square cushion with a patterned
              face and piped edge.
            </figcaption>
          </figure>
        </div>
      </section>

      <section
        id="examples"
        aria-labelledby="examples-title"
        className="scroll-mt-6 border-b border-border bg-page py-section"
      >
        <div className="mx-auto w-full max-w-page min-w-0 px-gutter">
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.62fr)] lg:items-end lg:gap-layout">
            <div className="min-w-0 max-w-2xl">
              <p className={eyebrowClasses}>Illustrative examples</p>
              <h2 id="examples-title" className={`mt-3 ${sectionTitleClasses}`}>
                Start with the cushion, then explore the finish.
              </h2>
            </div>
            <p className="max-w-2xl text-body text-text-muted lg:justify-self-end">
              These studies show how the three supported shapes could pair with
              different fabric directions. They are examples, not selectable
              products or accurate previews.
            </p>
          </div>

          <StitchDivider className="mt-layout" />

          <ul className="mt-layout grid min-w-0 auto-rows-fr gap-component sm:grid-cols-12 lg:grid-cols-3">
            {coverExamples.map((example) => (
              <CushionExample key={example.title} {...example} />
            ))}
          </ul>
        </div>
      </section>

      <section
        id="how-it-works"
        aria-labelledby="how-it-works-title"
        className="scroll-mt-6 bg-surface-subtle py-section"
      >
        <div className="mx-auto w-full max-w-page min-w-0 px-gutter">
          <div className="max-w-3xl">
            <p className={eyebrowClasses}>Three clear steps</p>
            <h2
              id="how-it-works-title"
              className={`mt-3 ${sectionTitleClasses}`}
            >
              From an existing cushion to a considered cover idea.
            </h2>
          </div>

          <ol className="landing-steps mt-layout grid min-w-0 gap-layout lg:grid-cols-3 lg:gap-component">
            {designSteps.map((step, index) => (
              <li
                key={step.title}
                className="flex min-w-0 gap-4 lg:flex-col lg:items-center lg:px-4 lg:text-center"
              >
                <span className="landing-step-marker flex size-12 shrink-0 items-center justify-center rounded-pill border-[1.5px] border-brand bg-surface font-mono text-readout text-brand shadow-card">
                  <span className="sr-only">Step </span>
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className={cardTitleClasses}>{step.title}</h3>
                  <p className="mt-2 text-body text-text-muted">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="landing-cta-title" className="landing-cta">
        <div className="relative mx-auto flex w-full max-w-page min-w-0 flex-col gap-component px-gutter py-layout sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 max-w-2xl">
            <h2
              id="landing-cta-title"
              className="font-display text-section-title font-heading tracking-heading text-on-brand"
            >
              See the cover idea in context.
            </h2>
            <p className="mt-3 text-body text-on-brand">
              Review the illustrative shapes and fabric directions already on
              this page.
            </p>
          </div>
          <a
            href="#examples"
            className={buttonClasses({
              className:
                "shrink-0 self-start border-on-brand bg-surface text-brand hover:border-on-brand hover:bg-surface-subtle hover:text-brand-hover sm:self-auto",
              element: "link",
              variant: "secondary",
            })}
          >
            View the cover examples
          </a>
        </div>
      </section>
    </>
  );
}
