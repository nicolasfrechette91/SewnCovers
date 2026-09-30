import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { classNames } from "./class-names";
import { cardTitleClasses } from "./headers";

export function emptyStateClasses(className?: string | false | null): string {
  return classNames(
    "flex min-w-0 flex-col items-center rounded-panel border border-dashed border-border-strong bg-surface px-card py-layout text-center",
    className,
  );
}

type EmptyStateHeading = "h2" | "h3";

export interface EmptyStateProps
  extends Omit<ComponentPropsWithoutRef<"section">, "title"> {
  action?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
  titleAs?: EmptyStateHeading;
  titleId?: string;
}

/**
 * Nothing here yet: a dashed outline, like a pattern piece drawn but not cut.
 */
export function EmptyState({
  action,
  className,
  description,
  title,
  titleAs: Title = "h2",
  titleId,
  ...sectionProps
}: EmptyStateProps) {
  return (
    <section {...sectionProps} className={emptyStateClasses(className)}>
      <span aria-hidden="true" className="stitch-rule stitch-rule-accent mb-component w-16" />
      <Title id={titleId} className={cardTitleClasses}>
        {title}
      </Title>
      {description ? (
        <div className="mt-3 max-w-prose text-body text-text-muted">{description}</div>
      ) : null}
      {action ? <div className="mt-component">{action}</div> : null}
    </section>
  );
}
