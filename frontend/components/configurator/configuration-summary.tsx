import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { classNames } from "../ui/class-names";

export interface ConfigurationSummaryItem {
  id: string;
  label: ReactNode;
  value?: ReactNode;
}

export interface ConfigurationSummaryProps
  extends Omit<ComponentPropsWithoutRef<"section">, "children" | "title"> {
  emptyMessage?: ReactNode;
  items: readonly ConfigurationSummaryItem[];
  missingValue?: ReactNode;
  title?: ReactNode;
}

export function ConfigurationSummary({
  "aria-label": ariaLabel = "Configuration summary",
  className,
  emptyMessage = "No configuration details are available yet.",
  items,
  missingValue = "Not selected",
  title = "Configuration summary",
  ...sectionProps
}: ConfigurationSummaryProps) {
  const itemIds = new Set(items.map((item) => item.id));
  if (itemIds.size !== items.length) {
    throw new RangeError("ConfigurationSummary item IDs must be unique.");
  }

  return (
    <section
      {...sectionProps}
      aria-label={ariaLabel}
      className={classNames(
        "min-w-0 rounded-panel border border-border bg-surface p-card shadow-card",
        className,
      )}
    >
      <h2 className="break-words font-display text-section-title font-heading tracking-heading text-text-primary">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="mt-component break-words text-supporting text-text-muted">
          {emptyMessage}
        </p>
      ) : (
        <dl className="mt-component divide-y divide-border">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid min-w-0 gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-component"
            >
              <dt className="min-w-0 break-words text-label font-control tracking-label text-text-muted">
                {item.label}
              </dt>
              <dd className="min-w-0 break-words text-body font-emphasis text-text-primary sm:text-right">
                {item.value === undefined ||
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
