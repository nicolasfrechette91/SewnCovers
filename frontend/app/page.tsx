import { CushionExample } from "@/components/landing";

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

const primaryLinkClasses =
  "inline-flex min-h-12 max-w-full items-center justify-center rounded-control border border-brand bg-brand px-control-x py-control-y text-center text-button font-control tracking-label break-words text-on-brand shadow-raised transition-[background-color,border-color,box-shadow] hover:border-brand-hover hover:bg-brand-hover active:border-brand-active active:bg-brand-active motion-reduce:transition-none";

export default function Home() {
  return (
    <>
      <section
        aria-labelledby="landing-title"
        className="overflow-hidden border-b border-border bg-surface"
      >
        <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-layout px-gutter py-section lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)] lg:items-center">
          <div className="min-w-0">
            <p className="text-label font-control tracking-label text-accent-strong">
              A cushion-cover design prototype
            </p>
            <h1
              id="landing-title"
              className="mt-3 max-w-3xl font-display text-page-title font-heading tracking-heading text-text-primary"
            >
              Plan a replacement cover around your cushion&apos;s real
              measurements.
            </h1>
            <p className="mt-component max-w-2xl text-body text-text-muted sm:text-lg sm:leading-8">
              SewnCovers explores a guided way to combine a supported cushion
              shape, exact dimensions, and a fabric direction before saving a
              design.
            </p>
            <div className="mt-8 flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center">
              <a href="#examples" className={primaryLinkClasses}>
                Explore cover examples
              </a>
              <a
                href="#how-it-works"
                className="inline-flex min-h-11 max-w-full items-center rounded-control px-1 text-button font-control break-words text-brand underline decoration-2 underline-offset-4 hover:text-brand-hover active:text-brand-active"
              >
                See how the idea works
              </a>
            </div>

            <aside
              aria-labelledby="prototype-status-title"
              className="mt-8 max-w-2xl rounded-card border border-border-strong bg-surface-subtle p-card"
            >
              <h2
                id="prototype-status-title"
                className="text-label font-control tracking-label text-text-primary"
              >
                Prototype status
              </h2>
              <p className="mt-2 text-supporting text-text-muted">
                This experience demonstrates the planned design journey. It
                does not take orders, calculate prices, or produce finished
                covers.
              </p>
            </aside>
          </div>

          <figure className="min-w-0 rounded-panel border border-border bg-page p-card shadow-raised">
            <div
              aria-hidden="true"
              className="relative flex min-h-72 items-center justify-center overflow-hidden rounded-card border border-border bg-surface-subtle px-card py-layout sm:min-h-80"
            >
              <span className="absolute top-5 left-5 text-supporting font-control tracking-label text-brand">
                Shape + size + fabric
              </span>
              <span className="landing-cushion landing-cushion-square landing-pattern-botanical block w-[68%] max-w-64" />
              <span className="absolute right-5 bottom-5 flex max-w-36 flex-col gap-1 rounded-control border border-border bg-surface px-3 py-2 text-supporting text-text-muted shadow-card">
                <span className="font-control text-text-primary">
                  Visual direction
                </span>
                <span>before a saved design</span>
              </span>
            </div>
            <figcaption className="mt-3 text-supporting text-text-muted">
              Illustrative study of a measured square cushion with a patterned
              face and piped edge.
            </figcaption>
          </figure>
        </div>
      </section>

      <section
        id="examples"
        aria-labelledby="examples-title"
        className="scroll-mt-6 bg-page py-section"
      >
        <div className="mx-auto w-full max-w-6xl min-w-0 px-gutter">
          <div className="max-w-2xl">
            <p className="text-label font-control tracking-label text-accent-strong">
              Illustrative examples
            </p>
            <h2
              id="examples-title"
              className="mt-2 font-display text-section-title font-heading tracking-heading text-text-primary"
            >
              Start with the cushion, then explore the finish.
            </h2>
            <p className="mt-4 text-body text-text-muted">
              These studies show how the three supported shapes could pair with
              different fabric directions. They are examples, not selectable
              products or accurate previews.
            </p>
          </div>

          <ul className="mt-layout grid min-w-0 gap-component md:grid-cols-3">
            {coverExamples.map((example) => (
              <CushionExample key={example.title} {...example} />
            ))}
          </ul>
        </div>
      </section>

      <section
        id="how-it-works"
        aria-labelledby="how-it-works-title"
        className="scroll-mt-6 border-y border-border bg-surface-subtle py-section"
      >
        <div className="mx-auto w-full max-w-6xl min-w-0 px-gutter">
          <div className="max-w-2xl">
            <p className="text-label font-control tracking-label text-accent-strong">
              Three clear steps
            </p>
            <h2
              id="how-it-works-title"
              className="mt-2 font-display text-section-title font-heading tracking-heading text-text-primary"
            >
              From an existing cushion to a considered cover idea.
            </h2>
          </div>

          <ol className="mt-layout grid min-w-0 gap-component lg:grid-cols-3">
            {designSteps.map((step, index) => (
              <li
                key={step.title}
                className="min-w-0 rounded-card border border-border bg-surface p-card shadow-card"
              >
                <span className="flex size-10 items-center justify-center rounded-pill border border-brand bg-brand text-button font-control text-on-brand">
                  <span className="sr-only">Step </span>
                  {index + 1}
                </span>
                <h3 className="mt-component font-display text-xl font-heading tracking-heading text-text-primary">
                  {step.title}
                </h3>
                <p className="mt-3 text-body text-text-muted">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="landing-cta-title" className="bg-brand">
        <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-component px-gutter py-layout sm:flex-row sm:items-center sm:justify-between">
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
            className="inline-flex min-h-12 max-w-full shrink-0 items-center justify-center self-start rounded-control border border-on-brand bg-surface px-control-x py-control-y text-center text-button font-control tracking-label break-words text-brand shadow-raised transition-[background-color,color,box-shadow] hover:bg-surface-subtle hover:text-brand-hover active:bg-page active:text-brand-active motion-reduce:transition-none sm:self-auto"
          >
            View the cover examples
          </a>
        </div>
      </section>
    </>
  );
}
