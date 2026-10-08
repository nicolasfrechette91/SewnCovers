import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { classNames } from "../ui/class-names";

export interface ConfigurationSummaryItem {
  id: string;
  label: ReactNode;
  swatchColor?: string;
  value?: ReactNode;
}

export interface ConfigurationSummaryProps
  extends Omit<ComponentPropsWithoutRef<"section">, "children" | "title"> {
  emptyMessage?: ReactNode;
  items: readonly ConfigurationSummaryItem[];
  missingValue?: ReactNode;
  title?: ReactNode;
}

/**
 * The region is named by its own visible heading (its `title`); pass
 * `aria-label` only to override that.
 */
export function ConfigurationSummary({
  "aria-label": ariaLabel,
  className,
  emptyMessage = "No configuration details are available yet.",
  items,
  missingValue = "Not selected",
  title = "Configuration summary",
  ...sectionProps
}: ConfigurationSummaryProps) {
  const headingId = useId();
  const itemIds = new Set(items.map((item) => item.id));
  if (itemIds.size !== items.length) {
    throw new RangeError("ConfigurationSummary item IDs must be unique.");
  }

  return (
    <section
      {...sectionProps}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : headingId}
      className={classNames(
        "min-w-0 rounded-panel border border-border bg-surface p-card shadow-hairline",
        className,
      )}
    >
      <h2
        id={headingId}
        className="break-words font-display text-section-title font-heading tracking-heading text-text-primary"
      >
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="mt-component break-words text-supporting text-text-muted">
          {emptyMessage}
        </p>
      ) : (
        <dl className="mt-component divide-y divide-dashed divide-border-strong border-t border-dashed border-border-strong">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid min-w-0 gap-1 py-3 last:pb-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-baseline sm:gap-component"
            >
              <dt className="min-w-0 break-words font-mono text-eyebrow uppercase tracking-eyebrow text-text-muted">
                {item.label}
              </dt>
              <dd className="min-w-0 break-words text-body font-emphasis text-text-primary sm:text-right">
                {item.swatchColor ? (
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="fabric-swatch inline-block size-5 rounded-pill border border-border-strong shadow-card"
                      style={{ backgroundColor: item.swatchColor }}
                    />
                    <span>{item.value}</span>
                  </span>
                ) : item.value === undefined ||
                item.value === null ||
                item.value === ""
                  ? missingValue
                  : item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
