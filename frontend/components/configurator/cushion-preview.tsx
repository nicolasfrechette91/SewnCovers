import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { classNames } from "../ui/class-names";

export interface CushionPreviewProps extends Omit<
  ComponentPropsWithoutRef<"figure">,
  "children" | "title"
> {
  /** Adjustments and notes shown beside the visual on wide layouts. */
  controls?: ReactNode;
  /** The figure caption, spanning the full width below everything else. */
  description?: ReactNode;
  /** Status and spec list kept directly under the visual. */
  details?: ReactNode;
  emptyMessage?: ReactNode;
  /** 1 on the Preview stage, where the title is the page's h1; 2 elsewhere. */
  headingLevel?: 1 | 2;
  title?: ReactNode;
  visual?: ReactNode;
  balanced?: boolean;
}

/**
 * The figure is named by its own visible heading; pass `aria-label` only to
 * override that.
 */
export function CushionPreview({
  "aria-label": ariaLabel,
  className,
  controls,
  description,
  details,
  emptyMessage = "Choose a pattern and measurements to see a preview.",
  headingLevel = 1,
  title = "Preview",
  visual,
  balanced = false,
  ...sectionProps
}: CushionPreviewProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const headingId = useId();

  return (
    <figure
      {...sectionProps}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : headingId}
      className={classNames(
        "min-w-0 rounded-panel border border-border bg-surface p-card shadow-hairline",
        className,
      )}
    >
      <Heading
        id={headingId}
        className="break-words font-display text-section-title font-heading tracking-heading text-text-primary"
      >
        {title}
      </Heading>
      {/* The visual and its spec list share a column so they stay together;
          the grid is its own box so the sticky column never overlaps the caption. */}
      <div
        className={classNames(
          "min-w-0",
          balanced &&
            "@3xl:grid @3xl:grid-cols-2 @3xl:items-start @3xl:gap-x-layout @5xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]",
        )}
      >
        <div
          className={classNames(
            "@container min-w-0",
            balanced && "@3xl:sticky @3xl:top-6",
          )}
        >
          <div className="cutting-mat mt-component flex aspect-[4/3] min-h-48 w-full min-w-0 items-center justify-center overflow-hidden rounded-card border border-border p-card">
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
                  className="block h-20 w-28 rounded-panel border border-dashed border-border-strong bg-surface sm:h-28 sm:w-40"
                />
                <p
                  role="status"
                  className="break-words text-supporting text-text-muted"
                >
                  {emptyMessage}
                </p>
              </div>
            )}
          </div>
          {details ? (
            <div className="mt-component min-w-0 break-words text-supporting text-text-muted">
              {details}
            </div>
          ) : null}
        </div>
        {controls ? (
          <div className="mt-component min-w-0 break-words text-supporting text-text-muted">
            {controls}
          </div>
        ) : null}
      </div>
      {description ? (
        <figcaption className="mt-component min-w-0 break-words text-supporting text-text-muted">
          {description}
        </figcaption>
      ) : null}
    </figure>
  );
}
