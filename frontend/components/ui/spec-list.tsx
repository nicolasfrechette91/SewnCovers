import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { classNames } from "./class-names";

export interface SpecListItem {
  key?: string;
  label: ReactNode;
  value: ReactNode;
  /**
   * Replaces the default value text classes (size, colour, wrapping) for this
   * item, e.g. a larger brand-coloured total or a flex row with a swatch.
   */
  valueClassName?: string;
}

export type SpecListLayout = "grid" | "rows";

/**
 * Column presets for the grid layout. 1 is a single column; 2, 3 and 4 add
 * columns from the sm and lg breakpoints; "container" follows the width of the
 * nearest @container (two columns, three from @xl) instead of the viewport.
 */
export type SpecListColumns = 1 | 2 | 3 | 4 | "container";

const columnClasses: Record<SpecListColumns, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  container: "grid-cols-2 @xl:grid-cols-3",
};

export const specLabelClasses =
  "font-mono text-eyebrow uppercase tracking-eyebrow text-text-muted";

export const specValueClasses = "text-body break-words text-text-primary";

export interface SpecListProps extends ComponentPropsWithoutRef<"dl"> {
  columns?: SpecListColumns;
  /** Dashed rules above and below the list, like a measured strip. */
  framed?: boolean;
  items: readonly SpecListItem[];
  layout?: SpecListLayout;
}

/**
 * Label/value pairs read like a spec sheet: mono labels, plain values.
 * "rows" puts label and value on one line, separated by stitched seams.
 */
export function SpecList({
  className,
  columns = 2,
  framed = false,
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
          ? classNames("grid gap-x-component gap-y-4", columnClasses[columns])
          : "divide-y divide-dashed divide-border-strong",
        framed && "border-y border-dashed border-border-strong py-4",
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
              item.valueClassName ?? specValueClasses,
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
