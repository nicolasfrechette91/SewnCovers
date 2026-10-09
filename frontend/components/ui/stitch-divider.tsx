import { classNames } from "./class-names";

export interface StitchDividerProps {
  className?: string;
  tone?: "muted" | "accent";
}

/** A decorative running stitch between groups of content. */
export function StitchDivider({
  className,
  tone = "muted",
}: StitchDividerProps) {
  return (
    <span
      aria-hidden="true"
      className={classNames(
        "stitch-rule w-full",
        tone === "accent" && "stitch-rule-accent",
        className,
      )}
    />
  );
}
