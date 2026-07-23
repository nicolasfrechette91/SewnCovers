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
    <li className="min-w-0">
      <figure className="flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <div
          aria-hidden="true"
          className="flex min-h-56 items-center justify-center overflow-hidden border-b border-border bg-surface-subtle p-card"
        >
          <span
            className={classNames(
              "landing-cushion block w-[72%]",
              patternClasses[pattern],
              shapeClasses[shape],
            )}
          />
        </div>
        <figcaption className="flex flex-1 flex-col p-card">
          <h3 className="font-display text-xl font-heading tracking-heading text-text-primary">
            {title}
          </h3>
          <p className="mt-3 text-supporting text-text-muted">{description}</p>
        </figcaption>
      </figure>
    </li>
  );
}
