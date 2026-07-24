import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { classNames } from "../ui/class-names";

export interface CushionPreviewProps
  extends Omit<ComponentPropsWithoutRef<"figure">, "children" | "title"> {
  description?: ReactNode;
  emptyMessage?: ReactNode;
  title?: ReactNode;
  visual?: ReactNode;
}

export function CushionPreview({
  "aria-label": ariaLabel = "Cushion preview",
  className,
  description,
  emptyMessage = "Choose a pattern and measurements to see a preview.",
  title = "Preview",
  visual,
  ...sectionProps
}: CushionPreviewProps) {
  return (
    <figure
      {...sectionProps}
      aria-label={ariaLabel}
      className={classNames(
        "min-w-0 rounded-panel border border-border bg-surface p-card shadow-raised",
        className,
      )}
    >
      <h2 className="break-words font-display text-section-title font-heading tracking-heading text-text-primary">
        {title}
      </h2>
      <div className="mt-component flex aspect-[4/3] min-h-48 w-full min-w-0 items-center justify-center overflow-hidden rounded-card border border-border bg-surface-subtle p-card">
        {visual ? (
          <div
            aria-hidden="true"
            className="flex size-full min-w-0 items-center justify-center overflow-hidden"
          >
            {visual}
          </div>
        ) : (
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <span
              aria-hidden="true"
              className="block h-20 w-28 rounded-panel border border-border-strong bg-surface shadow-card sm:h-28 sm:w-40"
            />
            <p className="break-words text-supporting text-text-muted">
              {emptyMessage}
            </p>
          </div>
        )}
      </div>
      {description ? (
        <figcaption className="mt-component min-w-0 break-words text-supporting text-text-muted">
          {description}
        </figcaption>
      ) : null}
    </figure>
  );
}
