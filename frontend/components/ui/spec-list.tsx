import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { classNames } from "./class-names";

export interface SpecListItem {
  key?: string;
  label: ReactNode;
  value: ReactNode;
}

export type SpecListLayout = "grid" | "rows";

export const specLabelClasses =
  "font-mono text-eyebrow uppercase tracking-eyebrow text-text-muted";

export const specValueClasses = "text-body break-words text-text-primary";

export interface SpecListProps extends ComponentPropsWithoutRef<"dl"> {
  items: readonly SpecListItem[];
  layout?: SpecListLayout;
}

/**
 * Label/value pairs read like a spec sheet: mono labels, plain values.
 * "rows" puts label and value on one line, separated by stitched seams.
 */
export function SpecList({
  className,
  items,
  layout = "grid",
  ...listProps
}: SpecListProps) {
  return (
    <dl
      {...listProps}
      className={classNames(
        "min-w-0",
        layout === "grid"
          ? "grid gap-x-component gap-y-4 sm:grid-cols-2"
          : "divide-y divide-dashed divide-border-strong",
        className,
      )}
    >
      {items.map((item, index) => (
        <div
          key={item.key ?? index}
          className={classNames(
            "min-w-0",
            layout === "rows" &&
              "flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-component",
          )}
        >
          <dt className={specLabelClasses}>{item.label}</dt>
          <dd
            className={classNames(
              specValueClasses,
              layout === "grid" ? "mt-1" : "sm:text-right",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
