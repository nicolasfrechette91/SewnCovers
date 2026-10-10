import type {
  ComponentPropsWithoutRef,
  ComponentPropsWithRef,
  ReactNode,
} from "react";

import { classNames } from "./class-names";

/** Mono, uppercase label preceded by a short measuring rule. */
export const eyebrowClasses =
  "eyebrow font-mono text-eyebrow uppercase tracking-eyebrow text-accent-strong";

export const pageTitleClasses =
  "font-display text-page-title font-heading tracking-heading break-words text-text-primary";

export const sectionTitleClasses =
  "font-display text-section-title font-heading tracking-heading break-words text-text-primary";

export const cardTitleClasses =
  "font-display text-card-title font-heading tracking-heading break-words text-text-primary";

const subheadClasses =
  "text-subhead font-control break-words text-text-primary";

const ledeClasses = "text-lede text-text-muted";

export type PageWidth = "page" | "content" | "reading";

const pageWidthClasses: Record<PageWidth, string> = {
  page: "max-w-page",
  content: "max-w-content",
  reading: "max-w-reading",
};

export interface PageShellProps extends ComponentPropsWithoutRef<"div"> {
  contentClassName?: string;
  width?: PageWidth;
}

/** The outer frame for every inner page: page colour, rhythm and width. */
export function PageShell({
  children,
  className,
  contentClassName,
  width = "page",
  ...divProps
}: PageShellProps) {
  return (
    <div {...divProps} className={classNames("bg-page py-section", className)}>
      <div
        className={classNames(
          "mx-auto w-full min-w-0 px-gutter",
          pageWidthClasses[width],
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export interface PageHeaderProps extends Omit<
  ComponentPropsWithoutRef<"header">,
  "title"
> {
  eyebrow?: ReactNode;
  lede?: ReactNode;
  title: ReactNode;
  titleClassName?: string;
  titleId?: string;
}

/** Eyebrow, h1 and lede, finished with a strip of ruler ticks. */
export function PageHeader({
  children,
  className,
  eyebrow,
  lede,
  title,
  titleClassName,
  titleId,
  ...headerProps
}: PageHeaderProps) {
  return (
    <header
      {...headerProps}
      className={classNames("mb-layout min-w-0", className)}
    >
      {eyebrow ? <p className={eyebrowClasses}>{eyebrow}</p> : null}
      <h1
        id={titleId}
        className={classNames(
          pageTitleClasses,
          eyebrow ? "mt-3" : null,
          titleClassName,
        )}
      >
        {title}
      </h1>
      {lede ? (
        <p className={classNames("mt-4 max-w-reading", ledeClasses)}>{lede}</p>
      ) : null}
      {children}
      <span aria-hidden="true" className="ruler mt-component max-w-60" />
    </header>
  );
}

type HeadingLevel = 2 | 3 | 4;

/** section and card are display headings; subhead is the quiet sans heading. */
export type SectionHeaderSize = "section" | "card" | "subhead";

const headingSizeClasses: Record<SectionHeaderSize, string> = {
  section: sectionTitleClasses,
  card: cardTitleClasses,
  subhead: subheadClasses,
};

export interface SectionHeaderProps extends Omit<
  ComponentPropsWithoutRef<"div">,
  "title"
> {
  actions?: ReactNode;
  eyebrow?: ReactNode;
  lede?: ReactNode;
  level?: HeadingLevel;
  size?: SectionHeaderSize;
  title: ReactNode;
  titleClassName?: string;
  titleId?: string;
  /** For the heading itself: a ref and tabIndex={-1} when script focuses it. */
  titleProps?: Omit<
    ComponentPropsWithRef<"h2">,
    "children" | "className" | "id"
  >;
}

/** A section or card heading block with optional eyebrow, lede and actions. */
export function SectionHeader({
  actions,
  className,
  eyebrow,
  lede,
  level = 2,
  size = "section",
  title,
  titleClassName,
  titleId,
  titleProps,
  ...divProps
}: SectionHeaderProps) {
  const Heading = `h${level}` as const;

  return (
    <div
      {...divProps}
      className={classNames(
        "flex min-w-0 flex-col gap-component sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 max-w-reading">
        {eyebrow ? <p className={eyebrowClasses}>{eyebrow}</p> : null}
        <Heading
          {...titleProps}
          id={titleId}
          className={classNames(
            headingSizeClasses[size],
            eyebrow ? "mt-3" : null,
            titleClassName,
          )}
        >
          {title}
        </Heading>
        {lede ? (
          <p
            className={classNames(
              "mt-3",
              size === "section"
                ? "text-body text-text-muted"
                : "text-supporting text-text-muted",
            )}
          >
            {lede}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
