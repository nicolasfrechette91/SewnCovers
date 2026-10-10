import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { classNames } from "./class-names";
import { cardTitleClasses } from "./headers";

export type EmptyStateSize = "default" | "compact";
export type EmptyStateAlign = "center" | "start";

function emptyStateClasses(
  className?: string | false | null,
  size: EmptyStateSize = "default",
  align: EmptyStateAlign = "center",
): string {
  return classNames(
    "flex min-w-0 flex-col border border-dashed border-border-strong bg-surface",
    size === "default" ? "rounded-panel px-card py-layout" : "rounded-card p-4",
    align === "center" ? "items-center text-center" : "items-start text-left",
    className,
  );
}

type EmptyStateHeading = "h2" | "h3";

export interface EmptyStateProps extends Omit<
  ComponentPropsWithoutRef<"section">,
  "title"
> {
  action?: ReactNode;
  /** "start" left-aligns the text, for a state that sits inside a panel. */
  align?: EmptyStateAlign;
  description?: ReactNode;
  /** "compact" is the in-panel form: card radius, p-4, a quiet title. */
  size?: EmptyStateSize;
  title?: ReactNode;
  titleAs?: EmptyStateHeading;
  titleId?: string;
}

/**
 * Nothing here yet: a dashed outline, like a pattern piece drawn but not cut.
 * The default is a centred card with a stitch rule; "compact" is a smaller
 * in-panel message that can be only a title, only a description, or both.
 */
export function EmptyState({
  action,
  align = "center",
  className,
  description,
  size = "default",
  title,
  titleAs: Title = "h2",
  titleId,
  ...sectionProps
}: EmptyStateProps) {
  const compact = size === "compact";

  return (
    <section
      {...sectionProps}
      className={emptyStateClasses(className, size, align)}
    >
      {compact ? null : (
        <span
          aria-hidden="true"
          className="stitch-rule stitch-rule-accent mb-component w-16"
        />
      )}
      {title ? (
        <Title
          id={titleId}
          className={
            compact
              ? "break-words text-body font-control text-text-primary"
              : cardTitleClasses
          }
        >
          {title}
        </Title>
      ) : null}
      {description ? (
        <div
          className={classNames(
            "break-words text-text-muted",
            compact
              ? classNames("text-supporting", title ? "mt-1" : null)
              : "mt-3 max-w-prose text-body",
          )}
        >
          {description}
        </div>
      ) : null}
      {action ? (
        <div className={compact ? "mt-3" : "mt-component"}>{action}</div>
      ) : null}
    </section>
  );
}
