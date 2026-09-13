import { classNames } from "../ui/class-names";

const patternClasses = {
  botanical: "landing-pattern-botanical",
  geometric: "landing-pattern-geometric",
  woven: "landing-pattern-woven",
} as const;

const shapeClasses = {
  box: "landing-cushion-box",
  rectangle: "landing-cushion-rectangle",
  square: "landing-cushion-square",
} as const;

export interface CushionExampleProps {
  description: string;
  pattern: keyof typeof patternClasses;
  shape: keyof typeof shapeClasses;
  title: string;
}

export function CushionExample({
  description,
  pattern,
  shape,
  title,
}: CushionExampleProps) {
  return (
    <li className="min-w-0 self-stretch sm:col-span-6 sm:last:col-start-4 lg:col-span-1 lg:last:col-start-auto">
      <figure className="landing-example-card grid h-full min-w-0 grid-rows-[14rem_1fr] overflow-hidden rounded-panel border border-border bg-surface shadow-card sm:grid-rows-[15rem_1fr] lg:grid-rows-[16rem_1fr]">
        <div
          aria-hidden="true"
          className="landing-example-media flex min-h-0 items-center justify-center overflow-hidden bg-surface-subtle px-card py-component"
        >
          <span
            className={classNames(
              "landing-cushion landing-example-illustration block",
              patternClasses[pattern],
              shapeClasses[shape],
            )}
          />
        </div>
        <figcaption className="landing-example-caption flex min-w-0 flex-col border-t border-border p-card">
          <h3 className="font-display text-xl font-heading tracking-heading text-text-primary">
            {title}
          </h3>
          <p className="mt-3 max-w-prose text-supporting text-text-muted">
            {description}
          </p>
        </figcaption>
      </figure>
    </li>
  );
}
